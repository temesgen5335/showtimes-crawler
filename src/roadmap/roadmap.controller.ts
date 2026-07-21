import { Controller, Get, Header, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Serves the static project walkthrough (public/roadmap.html) at /roadmap, and
 * redirects the site root to it so the bare deployment URL opens the walkthrough.
 * The file is read once at startup and held in memory — it never changes at
 * runtime. Excluded from Swagger (it's a page, not an API resource).
 */
function loadRoadmap(): string {
  // Works both locally (`nest start`, cwd = project root) and in the container
  // (WORKDIR /app, `public/` copied in). Fall back to a dirname-relative path.
  const candidates = [
    join(process.cwd(), 'public', 'roadmap.html'),
    join(__dirname, '..', '..', 'public', 'roadmap.html'),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      // try the next candidate
    }
  }
  return '<!doctype html><meta charset="utf-8"><title>Roadmap</title><p>Roadmap page is unavailable.</p>';
}

@ApiExcludeController()
@Controller()
export class RoadmapController {
  private readonly html = loadRoadmap();

  @Get('roadmap')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  roadmap(): string {
    return this.html;
  }

  @Get()
  @Redirect('/roadmap', 302)
  root(): void {
    // redirect only
  }
}
