# @juuxstar/http-decorators

TypeScript method decorators for registering Express routes on classes.

This package extracts the generic HTTP method decorator behavior from FrontLobby's `BaseAPI` into a small standalone package. It does not include FrontLobby-specific auth, validation, logging, billing, or error handling.

## Install

```sh
npm install @juuxstar/http-decorators express
```

Enable TypeScript decorators:

```json
{
	"compilerOptions": {
		"experimentalDecorators": true
	}
}
```

## Basic Usage

```ts
import type { Request, Response } from 'express';
import express from 'express';
import { DecoratedRouter, Get, Post } from '@juuxstar/http-decorators';

class AccountAPI extends DecoratedRouter {

	@Get('/status', { public : true })
	status(req: Request, res: Response) {
		res.json({ ok : true });
	}

	@Post('/accounts')
	createAccount(req: Request, res: Response) {
		res.status(201).json(req.body);
	}

}

const api = new AccountAPI();
const app = express();

app.use('/public', api.getRouterPublic());
app.use('/api', requireAuth, api.getRouterProtected());
```

Routes are protected by default. Pass `{ public: true }` as the first decorator argument to expose a route from `getRouterPublic()`.

## Route Middleware

Middleware can be passed after route options:

```ts
import type { NextFunction, Request, Response } from 'express';
import { Get } from '@juuxstar/http-decorators';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
	next();
}

class AdminAPI {

	@Get('/dashboard', requireAdmin)
	dashboard(req: Request, res: Response) {
		res.json({ dashboard : true });
	}

}
```

## Custom JSON Parsers

`All`, `Delete`, `Patch`, `Post`, and `Put` automatically receive `express.json()` unless the route already includes a middleware named `jsonParser`.

```ts
import express from 'express';
import type { Request, Response } from 'express';
import { Post } from '@juuxstar/http-decorators';

class UploadAPI {

	@Post('/upload', express.json({ limit : '10MB' }))
	upload(req: Request, res: Response) {
		res.json({ received : true });
	}

}
```

## Without Subclassing

Use `createRouter()` when you do not want to extend `DecoratedRouter`.

```ts
import { createRouter } from '@juuxstar/http-decorators';

const router = createRouter(new UploadAPI(), { public : false });
```

## API

- `All(path, ...optionsOrMiddleware)`
- `Delete(path, ...optionsOrMiddleware)`
- `Get(path, ...optionsOrMiddleware)`
- `Patch(path, ...optionsOrMiddleware)`
- `Post(path, ...optionsOrMiddleware)`
- `Put(path, ...optionsOrMiddleware)`
- `DecoratedRouter`
- `createRouter(instance, options)`
- `getRoutes(instance, options)`
- `HTTPMethod`
- `RouteOptions`
- `RouteDefinition`

Route paths must start with `/`. Subclass routes are registered before ancestor routes, matching Express's first-match behavior for more specific child routes.
