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
    // Bootstrap exception: when the install has never activated a license
    // before, allow activation without auth. This avoids the chicken-and-
    // egg first-run flow — middleware redirects unlicensed installs to
    // /setup/license, but requireAdmin needs a logged-in admin, which
    // requires getting past the license gate first. Using "no users yet"
    // as the bootstrap signal doesn't work because migrations seed a
    // default admin@localhost row on every fresh install; we check the
    // license record itself instead. Subsequent re-activations still go
    // through requireAdmin.
    const isBootstrap = await this.isFirstLicenseActivation(ctx);
    if (!isBootstrap) {
      this.requireAdmin(ctx);
    }
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

  private async isFirstLicenseActivation(ctx: IContext): Promise<boolean> {
    return ctx.licenseService.hasNeverActivated();
  }

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
