import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Request, Response } from 'express';

// Imported by the package's own name, so this resolves through package.json `exports` to the committed dist/,
// which is what a git or tarball install hands to consumers.
import * as entry from '@juuxstar/http-decorators';

import * as source from '../src/index.ts';

describe('package entry', () => {

	it('exports the same names from dist as from src', () => {
		assert.deepEqual(Object.keys(entry).sort(), Object.keys(source).sort());
	});

	it('registers decorated routes through the dist build', () => {
		class StatusAPI extends entry.DecoratedRouter {

			@entry.Get('/status', { public : true })
			status(req: Request, res: Response) {
				res.json({ ok : true });
			}

		}

		const routes = entry.getRoutes(new StatusAPI(), { public : true });

		assert.deepEqual(routes.map(route => [ route.method, route.path ]), [ [ 'get', '/status' ] ]);
	});

});
