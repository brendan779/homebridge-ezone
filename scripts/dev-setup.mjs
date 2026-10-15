// Prepares the local development Homebridge (git-ignored) on first use: .dev/mock from dev/config.mock.json,
// which points at the mock tablet (npm run mock). Never overwrites an existing config, which may hold edits.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const [source, directory] = ['dev/config.mock.json', '.dev/mock'];
const target = `${directory}/config.json`;

if (existsSync(target)) {
  console.log(`dev config: ${target} (existing)`);
} else {
  mkdirSync(directory, { recursive: true });
  copyFileSync(source, target);
  console.log(`dev config: created ${target} from ${source}`);
}
