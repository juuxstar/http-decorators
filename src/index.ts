import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import express from 'express';

const routeRegistry = new Map<Constructor, RouteDefinition[]>();
let routeRegistrationOrder = 0;

export enum HTTPMethod {
	All    = 'all',
	Delete = 'delete',
	Get    = 'get',
	Patch  = 'patch',
	Post   = 'post',
	Put    = 'put',
}

export interface RouteOptions {
	public?: boolean;
}

export interface RouteDefinition {
	method: HTTPMethod;
	middleware: RequestHandler[];
	options: RouteOptions;
	order: number;
	path: string;
	propertyKey: string;
}

export type RouteDecoratorArgument = RequestHandler | RouteOptions;

export interface RouterRegistrationOptions {
	includeAncestors?: boolean;
	public?: boolean;
	wrapHandler?: HandlerWrapper;
}

export type HandlerWrapper = (handler: RequestHandler, route: RouteDefinition) => RequestHandler | RequestHandler[];

export abstract class DecoratedRouter {

	getRouter(options: RouterRegistrationOptions = {}): Router {
		return createRouter(this, options);
	}

	getRouterPublic(options: Omit<RouterRegistrationOptions, 'public'> = {}): Router {
		return createRouter(this, { ...options, public : true });
	}

	getRouterProtected(options: Omit<RouterRegistrationOptions, 'public'> = {}): Router {
		return createRouter(this, { ...options, public : false });
	}

}

export function createRouter(instance: object, options: RouterRegistrationOptions = {}): Router {
	const router = express.Router();
	const routes = getRoutes(instance, options);

	routes.forEach(route => {
		const routeHandler = createRouteHandler(instance, route);
		const handlers = options.wrapHandler?.(routeHandler, route) ?? routeHandler;
		router[route.method](route.path, ...route.middleware, ...asArray(handlers));
	});

	return router;
}

export function getRoutes(instance: object, { includeAncestors = true, public: publicRoute }: RouterRegistrationOptions = {}): RouteDefinition[] {
	const constructors = includeAncestors
		? getAncestorConstructors(instance.constructor as Constructor)
		: [ instance.constructor as Constructor ];

	return constructors
		.flatMap(constructor => routeRegistry.get(constructor) ?? [])
		.filter(route => publicRoute === undefined || route.options.public === true === publicRoute);
}

export function All(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.All, path, optionsOrMiddleware);
}

export function Delete(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.Delete, path, optionsOrMiddleware);
}

export function Get(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.Get, path, optionsOrMiddleware);
}

export function Patch(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.Patch, path, optionsOrMiddleware);
}

export function Post(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.Post, path, optionsOrMiddleware);
}

export function Put(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	return route(HTTPMethod.Put, path, optionsOrMiddleware);
}

interface Constructor {
	new(...args: never[]): object;
}

function route(method: HTTPMethod, path: string, optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator {
	if (!path.startsWith('/')) {
		throw new Error(`API route path must start with '/': ${path}`);
	}

	let options: RouteOptions = {};
	let middleware = optionsOrMiddleware as RequestHandler[];

	if (isRouteOptions(optionsOrMiddleware[0])) {
		[ options, ...middleware ] = optionsOrMiddleware as [ RouteOptions, ...RequestHandler[] ];
	}

	if (shouldAddJsonParser(method, middleware)) {
		middleware = [ express.json(), ...middleware ];
	}

	const order = routeRegistrationOrder++;

	return function(classTarget: object, propertyKey: string | symbol | ClassMethodDecoratorContext) {
		if (isClassMethodDecoratorContext(propertyKey)) {
			if (typeof propertyKey.name !== 'string') {
				throw new Error('API route decorators do not support symbol method names');
			}

			propertyKey.addInitializer(function(this: unknown) {
				if (this === null || typeof this !== 'object') {
					return;
				}

				const constructor = getMethodOwnerConstructor(this, propertyKey.name as string, classTarget);
				registerRoute(constructor, { method, middleware, options, order, path, propertyKey : propertyKey.name as string });
			});
			return;
		}

		if (typeof propertyKey !== 'string') {
			throw new Error('API route decorators do not support symbol method names');
		}

		registerRoute(classTarget.constructor as Constructor, { method, middleware, options, order, path, propertyKey });
	} as MethodDecorator;
}

function createRouteHandler(instance: object, route: RouteDefinition): RequestHandler {
	return function(req: Request, res: Response, next: NextFunction) {
		const handler = instance[route.propertyKey as keyof typeof instance] as RequestHandler;
		return handler.call(instance, req, res, next);
	};
}

function getAncestorConstructors(constructor: Constructor): Constructor[] {
	const constructors: Constructor[] = [];
	let current: Function | null = constructor;

	while (current && current.prototype) {
		constructors.push(current as Constructor);
		current = Object.getPrototypeOf(current);
		if (!current || current === Function.prototype) {
			break;
		}
	}

	return constructors;
}

function shouldAddJsonParser(method: HTTPMethod, middleware: RequestHandler[]): boolean {
	return [ HTTPMethod.All, HTTPMethod.Delete, HTTPMethod.Patch, HTTPMethod.Post, HTTPMethod.Put ].includes(method)
		&& !middleware.some(routeMiddleware => routeMiddleware.name === 'jsonParser');
}

function isRouteOptions(value: RouteDecoratorArgument | undefined): value is RouteOptions {
	return Boolean(value)
		&& typeof value === 'object'
		&& !Array.isArray(value);
}

function isClassMethodDecoratorContext(value: unknown): value is ClassMethodDecoratorContext {
	return value !== null
		&& typeof value === 'object'
		&& 'kind' in value
		&& (value as ClassMethodDecoratorContext).kind === 'method';
}

function getMethodOwnerConstructor(instance: object, propertyKey: string, method: object): Constructor {
	let prototype = Object.getPrototypeOf(instance) as object | null;

	while (prototype) {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyKey);
		if (descriptor?.value === method) {
			return prototype.constructor as Constructor;
		}

		prototype = Object.getPrototypeOf(prototype) as object | null;
	}

	return instance.constructor as Constructor;
}

function registerRoute(constructor: Constructor, routeDefinition: RouteDefinition) {
	const routes = routeRegistry.get(constructor) ?? [];
	routeRegistry.set(constructor, routes);

	if (routes.some(route => route.order === routeDefinition.order && route.propertyKey === routeDefinition.propertyKey)) {
		return;
	}

	routes.push(routeDefinition);
	routes.sort((routeA, routeB) => routeA.order - routeB.order);
}

function asArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [ value ];
}
