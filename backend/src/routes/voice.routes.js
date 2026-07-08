import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import OpenAI from 'openai';
import config from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = Router();

function extensionForContentType(contentType = '') {
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('mpeg')) return '.mp3';
  if (contentType.includes('wav')) return '.wav';
  if (contentType.includes('ogg')) return '.ogg';
  return '.webm';
}

function audioFormatForContentType(contentType = '') {
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('aac')) return 'aac';
  return 'webm';
}

function isOpenRouterSpeechConfig() {
  return String(config.speech.baseUrl || '').includes('openrouter.ai')
    || String(config.speech.apiKey || '').replace(/^['"]|['"]$/g, '').startsWith('sk-or-')
    || String(config.speech.model || '').includes('/');
}

async function transcribeWithOpenRouter(buffer, contentType) {
  const endpoint = `${config.speech.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.speech.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.clientUrl,
      'X-Title': 'StructuraNet AI',
    },
    body: JSON.stringify({
      model: config.speech.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe this audio exactly. Return only the spoken words, with no commentary.',
            },
            {
              type: 'input_audio',
              input_audio: {
                data: buffer.toString('base64'),
                format: audioFormatForContentType(contentType),
              },
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      payload.error?.message || payload.message || 'OpenRouter voice transcription failed',
      response.status,
      'VOICE_TRANSCRIPTION_FAILED'
    );
  }

  return payload.choices?.[0]?.message?.content || payload.text || '';
}

router.post(
  '/transcribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    let filePath = null;

    // try/finally (no catch): asyncHandler forwards errors, the finally
    // block guarantees the temp audio file is removed either way.
    try {
      if (!config.speech.apiKey) {
        throw new AppError('Voice transcription needs SPEECH_API_KEY, ROUTER_API_KEY, or OPENAI_API_KEY in backend/.env', 503, 'VOICE_NOT_CONFIGURED');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError('No audio was received', 400, 'AUDIO_REQUIRED');
      }

      if (isOpenRouterSpeechConfig()) {
        const text = await transcribeWithOpenRouter(req.body, req.headers['content-type']);
        return res.json({ text });
      }

      const extension = extensionForContentType(req.headers['content-type']);
      filePath = path.join(os.tmpdir(), `structuranet-voice-${randomUUID()}${extension}`);
      await fs.promises.writeFile(filePath, req.body);

      const client = new OpenAI({
        apiKey: config.speech.apiKey,
        baseURL: config.speech.baseUrl,
      });

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: config.speech.model,
      });

      res.json({ text: transcription.text || '' });
    } finally {
      if (filePath) {
        fs.promises.unlink(filePath).catch(() => {});
      }
    }
  })
);

export default router;
