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
    // Bootstrap exception: when the installation has no users yet (very
    // first activation flow), allow license activation without auth. This
    // avoids the chicken-and-egg problem where the user can't log in
    // because there's no license, can't activate the license because
    // they're not logged in, and has to re-enter the key after
    // registration/login (poor UX). For all subsequent activations the
    // standard admin check applies.
    const isBootstrap = await this.isInstallationEmpty(ctx);
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

  private async isInstallationEmpty(ctx: IContext): Promise<boolean> {
    try {
      const users = await ctx.userRepository.findAll({ limit: 1 });
      return !users || users.length === 0;
    } catch {
      // Fail closed — if the lookup itself errors, require admin so we
      // don't accidentally open activation to unauthenticated requests.
      return false;
    }
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
