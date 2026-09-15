import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { NodesService } from '../nodes.service';

@Injectable()
export class NodeAuthGuard implements CanActivate {
  constructor(private nodes: NodesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      params: Record<string, string>;
      nodeSecret?: string;
    }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const secret = authHeader.slice('Bearer '.length);
    const rawId = request.params['id'];

    let nodeId: bigint;
    try {
      nodeId = BigInt(rawId);
    } catch {
      throw new UnauthorizedException('Invalid node ID');
    }

    const valid = await this.nodes.verifyNodeSecret(nodeId, secret);
    if (!valid) {
      throw new UnauthorizedException('Invalid node credentials');
    }

    request.nodeSecret = secret;
    return true;
  }
}
