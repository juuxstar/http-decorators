import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import express from 'express';

import { DecoratedRouter, Get, Post, createRouter } from '../src/index.ts';

let routeCalls: string[] = [];

const publicRouteMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
	routeCalls.push('public middleware');
	next();
};

const protectedRouteMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
	routeCalls.push('protected middleware');
	next();
};

class VisibilityAPI extends DecoratedRouter {

	@Get('/public', { public : true })
	publicRoute(req: Request, res: Response) {
		res.json('public');
	}

	@Post('/protected')
	protectedRoute(req: Request, res: Response) {
		res.json('protected');
	}

}

class CustomJsonParserAPI extends DecoratedRouter {

	@Post('/custom', express.json({ limit : '10MB' }))
	customParser(req: Request, res: Response) {
		res.json('custom');
	}

}

class MiddlewareAPI extends DecoratedRouter {

	@Get('/with-options', { public : true }, publicRouteMiddleware)
	withOptions(req: Request, res: Response) {
		routeCalls.push('public handler');
		res.json(routeCalls);
	}

	@Get('/without-options', protectedRouteMiddleware)
	withoutOptions(req: Request, res: Response) {
		routeCalls.push('protected handler');
		res.json(routeCalls);
	}

}

class ParentOrderAPI extends DecoratedRouter {

	@Get('/:id')
	getByID(req: Request, res: Response) {
		res.json('parent');
	}

}

class ChildOrderAPI extends ParentOrderAPI {

	@Get('/specific')
	getSpecific(req: Request, res: Response) {
		res.json('child');
	}

}

namespace CommonAuthAPIModule {

	export class AuthAPI extends DecoratedRouter {

		@Get('/signin', { public : true })
		signIn(req: Request, res: Response) {
			res.json('signin');
		}

	}

}

namespace PlatformAuthAPIModule {

	export class AuthAPI extends CommonAuthAPIModule.AuthAPI {

		@Post('/signup', { public : true })
		signUp(req: Request, res: Response) {
			res.json('signup');
		}

	}

}

describe('http decorators', function() {
	it('registers public decorated routes only on public routers', function() {
		const api = new VisibilityAPI();

		assert.equal(hasRoute(api.getRouterPublic(), '/public', 'get'), true);
		assert.equal(hasRoute(api.getRouterProtected(), '/public', 'get'), false);
	});

	it('registers protected decorated routes only on protected routers', function() {
		const api = new VisibilityAPI();

		assert.equal(hasRoute(api.getRouterProtected(), '/protected', 'post'), true);
		assert.equal(hasRoute(api.getRouterPublic(), '/protected', 'post'), false);
	});

	it('runs middleware passed after route options', async function() {
		routeCalls = [];

		const result = await runRoute(new MiddlewareAPI().getRouterPublic(), '/with-options', 'get');

		assert.deepEqual(result, [ 'public middleware', 'public handler' ]);
	});

	it('runs middleware passed without route options', async function() {
		routeCalls = [];

		const result = await runRoute(new MiddlewareAPI().getRouterProtected(), '/without-options', 'get');

		assert.deepEqual(result, [ 'protected middleware', 'protected handler' ]);
	});

	it('registers subclass routes before ancestor routes', function() {
		const routePaths = getRoutePaths(new ChildOrderAPI().getRouterProtected());

		assert.deepEqual(routePaths, [ '/specific', '/:id' ]);
	});

	it('does not duplicate routes when parent and subclass share the same class name', function() {
		const routePaths = getRoutePaths(new PlatformAuthAPIModule.AuthAPI().getRouterPublic());

		assert.deepEqual(routePaths, [ '/signup', '/signin' ]);
	});

	it('adds JSON parsing to routes that may receive bodies', function() {
		const route = getRoute(new VisibilityAPI().getRouterProtected(), '/protected', 'post');

		assert.equal(route.stack.map(layer => layer.handle.name).includes('jsonParser'), true);
	});

	it('does not add JSON parsing to GET routes', function() {
		const route = getRoute(new VisibilityAPI().getRouterPublic(), '/public', 'get');

		assert.equal(route.stack.map(layer => layer.handle.name).includes('jsonParser'), false);
	});

	it('does not duplicate explicit JSON parsers', function() {
		const route = getRoute(new CustomJsonParserAPI().getRouterProtected(), '/custom', 'post');

		assert.equal(route.stack.filter(layer => layer.handle.name === 'jsonParser').length, 1);
	});

	it('throws when a route path is missing a leading slash', function() {
		assert.throws(() => {
			class MissingLeadingSlashAPI extends DecoratedRouter {

				@Get('no-slash')
				handler(req: Request, res: Response) {
					res.json('bad');
				}

			}
			return MissingLeadingSlashAPI;
		}, /API route path must start with '\/': no-slash/);
	});

	it('throws when a decorated method uses a symbol name', function() {
		assert.throws(() => {
			const route = Get('/symbol');
			route({}, Symbol('handler'), {});
		}, /API route decorators do not support symbol method names/);
	});

	it('supports creating a router without subclassing DecoratedRouter', function() {
		class PlainAPI {

			@Get('/plain')
			plain(req: Request, res: Response) {
				res.json('plain');
			}

		}

		assert.equal(hasRoute(createRouter(new PlainAPI()), '/plain', 'get'), true);
	});
});

type HTTPVerb = 'delete' | 'get' | 'patch' | 'post' | 'put';

interface ExpressRoute {
	methods: Record<string, boolean>;
	path: string;
	stack: ExpressRouteLayer[];
}

interface ExpressRouteLayer {
	handle: RequestHandler;
}

interface RouterLayer {
	route?: ExpressRoute;
}

interface RouterWithStack {
	stack: RouterLayer[];
}

function getRoutePaths(router: Router): string[] {
	return getRoutes(router).map(route => route.path);
}

function hasRoute(router: Router, path: string, method: HTTPVerb): boolean {
	return Boolean(getRoutes(router).find(route => route.path === path && route.methods[method]));
}

function getRoute(router: Router, path: string, method: HTTPVerb): ExpressRoute {
	const route = getRoutes(router).find(candidate => candidate.path === path && candidate.methods[method]);
	assert.ok(route, `Route ${method.toUpperCase()} ${path} was not found`);
	return route;
}

function getRoutes(router: Router): ExpressRoute[] {
	return (router as unknown as RouterWithStack).stack
		.map(layer => layer.route)
		.filter(route => route !== undefined);
}

async function runRoute(router: Router, path: string, method: HTTPVerb): Promise<unknown> {
	const route = getRoute(router, path, method);
	const req = {} as Request;

	return await new Promise((resolve, reject) => {
		const res = {
			json(value: unknown) {
				resolve(value);
			},
		} as Response;

		let index = 0;
		const next = (error?: unknown) => {
			if (error) {
				reject(error);
				return;
			}

			const layer = route.stack[index++];
			if (!layer) {
				reject(new Error(`Route ${method.toUpperCase()} ${path} did not send a response`));
				return;
			}

			try {
				layer.handle(req, res, next);
			}
			catch (routeError) {
				reject(routeError);
			}
		};

		next();
	});
}
