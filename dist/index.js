import express from 'express';
const routeRegistry = new Map();
let routeRegistrationOrder = 0;
export var HTTPMethod;
(function (HTTPMethod) {
    HTTPMethod["All"] = "all";
    HTTPMethod["Delete"] = "delete";
    HTTPMethod["Get"] = "get";
    HTTPMethod["Patch"] = "patch";
    HTTPMethod["Post"] = "post";
    HTTPMethod["Put"] = "put";
})(HTTPMethod || (HTTPMethod = {}));
export class DecoratedRouter {
    getRouter(options = {}) {
        return createRouter(this, options);
    }
    getRouterPublic(options = {}) {
        return createRouter(this, { ...options, public: true });
    }
    getRouterProtected(options = {}) {
        return createRouter(this, { ...options, public: false });
    }
}
export function createRouter(instance, options = {}) {
    const router = express.Router();
    const routes = getRoutes(instance, options);
    routes.forEach(route => {
        const routeHandler = createRouteHandler(instance, route);
        const handlers = options.wrapHandler?.(routeHandler, route) ?? routeHandler;
        router[route.method](route.path, ...route.middleware, ...asArray(handlers));
    });
    return router;
}
export function getRoutes(instance, { includeAncestors = true, public: publicRoute } = {}) {
    const constructors = includeAncestors
        ? getAncestorConstructors(instance.constructor)
        : [instance.constructor];
    return constructors
        .flatMap(constructor => routeRegistry.get(constructor) ?? [])
        .filter(route => publicRoute === undefined || route.options.public === true === publicRoute);
}
export function All(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.All, path, optionsOrMiddleware);
}
export function Delete(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.Delete, path, optionsOrMiddleware);
}
export function Get(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.Get, path, optionsOrMiddleware);
}
export function Patch(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.Patch, path, optionsOrMiddleware);
}
export function Post(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.Post, path, optionsOrMiddleware);
}
export function Put(path, ...optionsOrMiddleware) {
    return route(HTTPMethod.Put, path, optionsOrMiddleware);
}
function route(method, path, optionsOrMiddleware) {
    if (!path.startsWith('/')) {
        throw new Error(`API route path must start with '/': ${path}`);
    }
    let options = {};
    let middleware = optionsOrMiddleware;
    if (isRouteOptions(optionsOrMiddleware[0])) {
        [options, ...middleware] = optionsOrMiddleware;
    }
    if (shouldAddJsonParser(method, middleware)) {
        middleware = [express.json(), ...middleware];
    }
    const order = routeRegistrationOrder++;
    return function (classTarget, propertyKey) {
        if (isClassMethodDecoratorContext(propertyKey)) {
            if (typeof propertyKey.name !== 'string') {
                throw new Error('API route decorators do not support symbol method names');
            }
            propertyKey.addInitializer(function () {
                if (this === null || typeof this !== 'object') {
                    return;
                }
                const constructor = getMethodOwnerConstructor(this, propertyKey.name, classTarget);
                registerRoute(constructor, { method, middleware, options, order, path, propertyKey: propertyKey.name });
            });
            return;
        }
        if (typeof propertyKey !== 'string') {
            throw new Error('API route decorators do not support symbol method names');
        }
        registerRoute(classTarget.constructor, { method, middleware, options, order, path, propertyKey });
    };
}
function createRouteHandler(instance, route) {
    return function (req, res, next) {
        const handler = instance[route.propertyKey];
        return handler.call(instance, req, res, next);
    };
}
function getAncestorConstructors(constructor) {
    const constructors = [];
    let current = constructor;
    while (current && current.prototype) {
        constructors.push(current);
        current = Object.getPrototypeOf(current);
        if (!current || current === Function.prototype) {
            break;
        }
    }
    return constructors;
}
function shouldAddJsonParser(method, middleware) {
    return [HTTPMethod.All, HTTPMethod.Delete, HTTPMethod.Patch, HTTPMethod.Post, HTTPMethod.Put].includes(method)
        && !middleware.some(routeMiddleware => routeMiddleware.name === 'jsonParser');
}
function isRouteOptions(value) {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value);
}
function isClassMethodDecoratorContext(value) {
    return value !== null
        && typeof value === 'object'
        && 'kind' in value
        && value.kind === 'method';
}
function getMethodOwnerConstructor(instance, propertyKey, method) {
    let prototype = Object.getPrototypeOf(instance);
    while (prototype) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyKey);
        if (descriptor?.value === method) {
            return prototype.constructor;
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    return instance.constructor;
}
function registerRoute(constructor, routeDefinition) {
    const routes = routeRegistry.get(constructor) ?? [];
    routeRegistry.set(constructor, routes);
    if (routes.some(route => route.order === routeDefinition.order && route.propertyKey === routeDefinition.propertyKey)) {
        return;
    }
    routes.push(routeDefinition);
    routes.sort((routeA, routeB) => routeA.order - routeB.order);
}
function asArray(value) {
    return Array.isArray(value) ? value : [value];
}
