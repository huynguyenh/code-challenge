// Boot script. `lib/env` runs `dotenv/config` and validates the env at
// import time, so just importing it has the side effect of refusing to
// boot if anything's wrong.
import { env } from './lib/env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[problem5] listening on http://localhost:${env.PORT}`);
});
