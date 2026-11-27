import { ENV } from './env.generated';

export const environment = {
  supabaseUrl: ENV.supabaseUrl,
  supabaseAnonKey: ENV.supabaseAnonKey,
  /** Backend en memoria solo para pruebas locales (npm run start:mock). */
  mock: (ENV as { mock?: boolean }).mock === true,
};
