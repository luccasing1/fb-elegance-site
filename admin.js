// netlify/functions/admin.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fbadmin';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== ADMIN_PASSWORD) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Não autorizado' }),
    };
  }

  const path = event.path.replace('/.netlify/functions/admin', '');
  const method = event.httpMethod;

  try {
    // GET /produtos
    if (method === 'GET' && path === '/produtos') {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // POST /produtos
    if (method === 'POST' && path === '/produtos') {
      const body = JSON.parse(event.body);
      const { nome, descricao_completa, preco, categoria, status, tamanhos, numeracao, imagesBase64 } = body;

      if (!nome || !preco) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nome e preço obrigatórios' }) };
      }

      const uploadedUrls = [];
      if (imagesBase64 && Array.isArray(imagesBase64)) {
        for (const base64 of imagesBase64) {
          const matches = base64.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
          if (!matches) continue;
          const ext = matches[1];
          const fileData = matches[2];
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
          const buffer = Buffer.from(fileData, 'base64');

          const { error: uploadError } = await supabase.storage
            .from('produtos')
            .upload(fileName, buffer, { contentType: `image/${ext}` });

          if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);

          const { data: publicUrlData } = supabase.storage
            .from('produtos')
            .getPublicUrl(fileName);
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      }

      const novoProduto = {
        nome,
        descricao_completa,
        preco,
        categoria,
        status,
        images: uploadedUrls,
      };
      if (categoria === 'vestuario') novoProduto.tamanhos = tamanhos;
      if (categoria === 'calcados') novoProduto.numeracao = numeracao;

      const { data, error } = await supabase.from('produtos').insert([novoProduto]).select();
      if (error) throw error;
      return { statusCode: 201, headers, body: JSON.stringify(data[0]) };
    }

    // PUT /produtos/:id
    if (method === 'PUT' && path.startsWith('/produtos/')) {
      const id = path.split('/')[2];
      const body = JSON.parse(event.body);
      const { imagesBase64, ...updates } = body;

      let updatedImages = updates.images || [];
      if (imagesBase64 && Array.isArray(imagesBase64)) {
        for (const base64 of imagesBase64) {
          const matches = base64.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
          if (!matches) continue;
          const ext = matches[1];
          const fileData = matches[2];
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
          const buffer = Buffer.from(fileData, 'base64');

          const { error: uploadError } = await supabase.storage
            .from('produtos')
            .upload(fileName, buffer, { contentType: `image/${ext}` });

          if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);

          const { data: publicUrlData } = supabase.storage
            .from('produtos')
            .getPublicUrl(fileName);
          updatedImages.push(publicUrlData.publicUrl);
        }
      }
      updates.images = updatedImages;

      const { error } = await supabase.from('produtos').update(updates).eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE /produtos/:id
    if (method === 'DELETE' && path.startsWith('/produtos/')) {
      const id = path.split('/')[2];
      const { data: produto } = await supabase.from('produtos').select('images').eq('id', id).single();
      if (produto && produto.images) {
        for (const url of produto.images) {
          const fileName = url.split('/').pop();
          await supabase.storage.from('produtos').remove([fileName]);
        }
      }
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro na função admin:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};