/**
 * Export routes — trigger export, download files.
 *
 * SECURITY NOTE: This file previously used `exec("zip -r \"${path}\"")` which
 * was vulnerable to command injection if a path contained shell metacharacters.
 * It now uses the `archiver` npm package, which streams ZIP output without
 * spawning a shell — closing the injection vector and removing the dependency
 * on a system `zip` binary.
 *
 * AUTH NOTE: The /download/:file endpoint is triggered by the browser via an
 * <a download> click, which cannot set Authorization headers. So it uses
 * `sseAuth` (accepts ?token= query param) instead of `requireAuth` (header
 * only). This is the same pattern used by the SSE stream endpoint.
 */
import { Router } from 'express';
import { ExportJob } from '../models/Export.js';
import { requireAuth, sseAuth } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, asyncHandler } from '../utils/errors.js';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import logger from '../utils/logger.js';

const router = Router();

async function findOwnedExport(exportId, userId) {
  const job = await ExportJob.findById(exportId);
  if (!job) throw new NotFoundError('Export job not found');
  if (job.userId.toString() !== userId.toString()) {
    throw new ForbiddenError('Not your export');
  }
  return job;
}

// ── GET /api/export/:id/status ─────────────────────────────
// Called via Axios (with Authorization header) — uses requireAuth.
router.get('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const job = await findOwnedExport(req.params.id, req.user._id);
  res.json({
    status: job.status,
    files: job.files,
    validation: job.validation,
    error: job.error,
  });
}));

// ── GET /api/export/:id/download/:file ─────────────────────
// file: 'gns3project' | 'configs' | 'manifest'
//
// Returns one of the three deployment artifacts:
//  - gns3project: the importable .gns3project file (single file download)
//  - configs:     a .zip of all device startup configs (one .cfg per device)
//  - manifest:    the image-requirements checklist (.txt)
//
// AUTH: This endpoint is triggered by the browser via an <a download> click,
// which cannot set Authorization headers. So it uses `sseAuth` (accepts
// ?token= query param) instead of `requireAuth` (header only). The frontend
// builds the URL with ?token=<jwt> in services/endpoints.js → exportApi.downloadUrl.
router.get('/:id/download/:file', sseAuth, asyncHandler(async (req, res) => {
  const job = await findOwnedExport(req.params.id, req.user._id);
  if (job.status !== 'complete') {
    throw new NotFoundError('Export not ready');
  }

  const fileType = req.params.file;

  // ── gns3project: single file download ──────────────────
  // .gns3project is a ZIP archive (GNS3 portable project format).
  // Set explicit Content-Type + Content-Disposition so the browser
  // downloads with the correct .gns3project extension (not .json or .zip).
  if (fileType === 'gns3project') {
    const p = job.files.gns3Project;
    if (!p || !fs.existsSync(p)) throw new NotFoundError('GNS3 project file not found');
    const fname = path.basename(p);
    res.setHeader('Content-Type', 'application/gns3project');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    return res.sendFile(path.resolve(p));
  }

  // ── configs: zip the configs_review directory on the fly ──
  // Uses archiver (no shell spawn) — closes the command-injection
  // vulnerability that existed with `exec("zip -r ...")`.
  if (fileType === 'configs') {
    const dir = job.files.configsZip;
    if (!dir || !fs.existsSync(dir)) throw new NotFoundError('Configs directory not found');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="configs.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      logger.error('archiver error (configs.zip):', err);
      // Headers already sent — can only end the response
      res.end();
    });
    archive.pipe(res);
    archive.directory(dir, false);
    archive.finalize();
    return;
  }

  // ── manifest: the image-requirements checklist ─────────
  if (fileType === 'manifest') {
    const p = job.files.manifest;
    if (!p || !fs.existsSync(p)) throw new NotFoundError('Manifest file not found');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="requirements.txt"');
    return res.sendFile(path.resolve(p));
  }

  throw new NotFoundError('Unknown file type');
}));

export default router;
