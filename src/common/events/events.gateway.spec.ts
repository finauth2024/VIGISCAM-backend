import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { tenantRoom, userRoom } from './event-channels';

/**
 * Connection-handshake tests. The live cross-tenant emit isolation is
 * exercised against a real socket.io server in a future contract test;
 * here we verify the handshake logic (verify, accept, reject, join rooms).
 */
describe('EventsGateway', () => {
  const validPayload = {
    sub: 'user-1',
    email: 'u@example.com',
    tenantId: 'tenant-A',
    role: 'INDIVIDUAL',
    type: 'access',
  };

  function makeJwt(verify: () => Promise<unknown>): JwtService {
    return { verifyAsync: jest.fn(verify) } as unknown as JwtService;
  }

  function makeSocket(token: string | null) {
    const joined: string[] = [];
    const socket = {
      id: 'sock-1',
      data: {},
      handshake: {
        auth: token ? { token } : {},
        headers: {},
      },
      join: jest.fn(async (room: string) => {
        joined.push(room);
      }),
      disconnect: jest.fn(),
    };
    return { socket, joined };
  }

  it('rejects a socket with no bearer token', async () => {
    const gateway = new EventsGateway(makeJwt(async () => validPayload));
    const { socket } = makeSocket(null);
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects a socket whose JWT fails verification', async () => {
    const gateway = new EventsGateway(
      makeJwt(async () => {
        throw new Error('invalid signature');
      }),
    );
    const { socket } = makeSocket('garbage');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects a refresh-type token (only access tokens may open sockets)', async () => {
    const gateway = new EventsGateway(makeJwt(async () => ({ ...validPayload, type: 'refresh' })));
    const { socket } = makeSocket('refresh-token');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('accepts a valid token and joins tenant + user rooms', async () => {
    const gateway = new EventsGateway(makeJwt(async () => validPayload));
    const { socket, joined } = makeSocket('valid-bearer');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(joined).toEqual([tenantRoom('tenant-A'), userRoom('user-1')]);
    expect(socket.data).toEqual({ userId: 'user-1', tenantId: 'tenant-A' });
  });

  it('strips a "Bearer " prefix from the handshake auth field', async () => {
    const verify = jest.fn(async () => validPayload);
    const gateway = new EventsGateway(makeJwt(verify));
    const { socket } = makeSocket('Bearer real-token');
    await gateway.handleConnection(socket as never);
    expect(verify).toHaveBeenCalledWith('real-token');
  });

  it('falls back to the Authorization header when handshake.auth is empty', async () => {
    const verify = jest.fn(async () => validPayload);
    const gateway = new EventsGateway(makeJwt(verify));
    const { socket } = makeSocket(null);
    socket.handshake.headers = {
      authorization: 'Bearer header-token',
    } as never;
    await gateway.handleConnection(socket as never);
    expect(verify).toHaveBeenCalledWith('header-token');
  });

  describe('emit helpers route to the correct rooms', () => {
    it('emitToTenant routes through tenantRoom()', () => {
      const emit = jest.fn();
      const to = jest.fn(() => ({ emit }));
      const gateway = new EventsGateway(makeJwt(async () => validPayload));
      (gateway as unknown as { server: { to: typeof to } }).server = { to };
      gateway.emitToTenant('tenant-A', 'risk.alert', {
        riskLevel: 'CRITICAL',
        reason: 'test',
      });
      expect(to).toHaveBeenCalledWith(tenantRoom('tenant-A'));
      expect(emit).toHaveBeenCalledWith('risk.alert', {
        riskLevel: 'CRITICAL',
        reason: 'test',
      });
    });
    it('emitToUser routes through userRoom()', () => {
      const emit = jest.fn();
      const to = jest.fn(() => ({ emit }));
      const gateway = new EventsGateway(makeJwt(async () => validPayload));
      (gateway as unknown as { server: { to: typeof to } }).server = { to };
      gateway.emitToUser('user-1', 'guardian-pause.countdown', {
        pauseEventId: 'p1',
        status: 'TICK',
        remainingSeconds: 30,
      });
      expect(to).toHaveBeenCalledWith(userRoom('user-1'));
    });
  });
});
