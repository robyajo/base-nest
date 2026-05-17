import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export function OAuthCallbackGuard(strategy: string) {
  class Guard extends AuthGuard(strategy) {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest<{ query: Record<string, string> }>();
      if (request.query.error) {
        return true;
      }
      return super.canActivate(context);
    }

    handleRequest<TUser>(err: Error | null, user: TUser): TUser | null {
      if (err || !user) {
        return null;
      }
      return user;
    }
  }
  return Guard;
}
