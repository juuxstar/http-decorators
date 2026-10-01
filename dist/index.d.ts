import type { RequestHandler, Router } from 'express';
export declare enum HTTPMethod {
    All = "all",
    Delete = "delete",
    Get = "get",
    Patch = "patch",
    Post = "post",
    Put = "put"
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
export declare abstract class DecoratedRouter {
    getRouter(options?: RouterRegistrationOptions): Router;
    getRouterPublic(options?: Omit<RouterRegistrationOptions, 'public'>): Router;
    getRouterProtected(options?: Omit<RouterRegistrationOptions, 'public'>): Router;
}
export declare function createRouter(instance: object, options?: RouterRegistrationOptions): Router;
export declare function getRoutes(instance: object, { includeAncestors, public: publicRoute }?: RouterRegistrationOptions): RouteDefinition[];
export declare function All(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
export declare function Delete(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
export declare function Get(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
export declare function Patch(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
export declare function Post(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
export declare function Put(path: string, ...optionsOrMiddleware: RouteDecoratorArgument[]): MethodDecorator;
//# sourceMappingURL=index.d.ts.map