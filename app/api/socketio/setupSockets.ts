import { RedisClient } from 'redis';
import cookie from 'cookie';
import { Server } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import { Application, Request, Response, NextFunction } from 'express';
import { config } from 'api/config';
import { tenants } from 'api/tenants/tenantContext';
import { createAdapter } from '@socket.io/redis-adapter';
import { handleError } from 'api/utils';

declare global {
  namespace Express {
    export interface Request {
      emitToSessionSocket: Function;
      sockets: {
        emitToCurrentTenant: Function;
      };
    }
  }
  namespace SocketIO {
    export interface Server {
      emitToCurrentTenant(event: string, ...args: any[]): void;
    }
  }
}

const setupSockets = (server: Server, app: Application) => {
  const io = new SocketIoServer(server);

  io.on('connection', socket => {
    //eslint-disable-next-line @typescript-eslint/no-floating-promises
    socket.join(socket.request.headers.tenant || config.defaultTenant.name);
    const socketCookie = cookie.parse(socket.request.headers.cookie || '');
    if (socketCookie) {
      //eslint-disable-next-line @typescript-eslint/no-floating-promises
      socket.join(socketCookie['connect.sid']);
    }
  });

  const sockets = {
    emitToCurrentTenant: (event: string, ...args: any[]) => {
      io.to(tenants.current().name).emit(event, ...args);
    },
  };

  if (config.redis.activated) {
    const pubClient = new RedisClient({ host: config.redis.host, port: config.redis.port });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    io.of('/').adapter.on('error', e => {
      handleError(e, { useContext: false });
    });
  }

  app.use((req, _res, next) => {
    req.sockets = sockets;
    next();
  });

  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.emitToSessionSocket = (event: string, ...args: any[]) => {
      const cookies = cookie.parse(req.get('cookie') || '');
      io.to(cookies['connect.sid']).emit(event, ...args);
    };

    next();
  });
};

export { setupSockets };
