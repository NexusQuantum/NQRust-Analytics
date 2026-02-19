import { GraphQLError } from 'graphql';
import { IContext } from '@server/types';

export class LicenseResolver {
  licenseStatus = async (
    _root: unknown,
    _args: unknown,
    ctx: IContext,
  ) => {
    // License status is accessible without auth so the activation page can query it
    return ctx.licenseState;
  };

  activateLicense = async (
    _root: unknown,
    args: { data: { licenseKey: string } },
    ctx: IContext,
  ) => {
    this.requireAdmin(ctx);
    const state = await ctx.licenseService.activateLicenseKey(
      args.data.licenseKey,
    );
    return state;
  };

  refreshLicense = async (
    _root: unknown,
    _args: unknown,
    ctx: IContext,
  ) => {
    this.requireAdmin(ctx);
    const state = await ctx.licenseService.checkLicense();
    return state;
  };

  private requireAdmin(ctx: IContext) {
    if (!ctx.user) {
      throw new GraphQLError('Authentication required', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    const isAdmin = ctx.user.roles?.some(
      (r: any) => r.name === 'admin',
    );
    if (!isAdmin) {
      throw new GraphQLError('Admin access required', {
        extensions: { code: 'FORBIDDEN' },
      });
    }
  }
}
