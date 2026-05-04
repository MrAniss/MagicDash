// Loads backend/.env into process.env at module-eval time.
// Imported FIRST by any config file that reads process.env at the top level
// — ES module imports are hoisted, so config files would otherwise see an
// empty process.env (server.js's dotenv.config() runs after their bodies).
//
// dotenv.config() is idempotent: calling it again from server.js is a no-op.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
