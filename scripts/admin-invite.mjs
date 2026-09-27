import { randomBytes } from "node:crypto";
const token = randomBytes(32).toString("base64url");
console.log("Private setup. Run locally, never paste this output in chat.");
console.log("1. Stop the local dev server.");
console.log(
  `2. Start it with: LOVELOOM_ADMIN_SETUP_TOKEN=${token} npm run dev`,
);
console.log(`3. Open http://localhost:3000/#admin-setup=${token}`);
console.log(
  "4. Set a new owner password. Remove the setup variable and restart.",
);
