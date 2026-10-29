require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const app = express();
const port = Number(process.env.PORT || 3000);
const maxMb = Math.min(20, Math.max(1, Number(process.env.MAX_UPLOAD_MB || 12)));
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });
app.get('/health', (_req, res) => res.json({ ok: true, service: 'zenvox-ai-backend' }));
app.post('/api/ai/chat', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI backend is not configured. Add OPENAI_API_KEY to server environment variables.' });
    const question = String(req.body.message || 'Please analyze the attached file.').slice(0, 12000);
    const content = [{ type: 'text', text: question }];
    const file = req.file;
    if (file) {
      const type = String(file.mimetype || '').toLowerCase();
      const name = String(file.originalname || 'attachment').slice(0, 180);
      if (type.startsWith('image/') && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) {
        content.push({ type: 'image_url', image_url: { url: `data:${type};base64,${file.buffer.toString('base64')}`, detail: 'auto' } });
      } else if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
        const parsed = await pdfParse(file.buffer);
        content.push({ type: 'text', text: `Extracted PDF text from ${name}:\n${String(parsed.text || '').slice(0, 60000) || '[No selectable text found; this PDF may be scanned.]'}` });
      } else if (/^(text\/|application\/(json|csv))/.test(type) || /\.(txt|csv|md|json|js|html|css)$/i.test(name)) {
        content.push({ type: 'text', text: `File ${name}:\n${file.buffer.toString('utf8').slice(0, 60000)}` });
      } else {
        return res.status(415).json({ error: 'Unsupported file type. Use an image, text/code file, CSV, JSON, or text-based PDF.' });
      }
    }
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', messages: [{ role: 'system', content: 'You are ZenvoX Ride AI. Be helpful, safety-conscious, and clear. Do not invent legal or mechanical certainty; recommend a qualified professional for high-risk decisions.' }, { role: 'user', content }], max_tokens: 1400 })
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.error?.message || 'AI provider request failed.' });
    res.json({ reply: data.choices?.[0]?.message?.content || 'The AI provider returned no text.' });
  } catch (error) {
    console.error('AI request failed:', error.message);
    res.status(500).json({ error: 'Could not process this request. Check backend logs and file format.' });
  }
});
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(413).json({ error: `Upload rejected: ${err.message}` });
  res.status(500).json({ error: 'Unexpected backend error.' });
});
app.listen(port, () => console.log(`ZenvoX AI backend listening on ${port}`));
