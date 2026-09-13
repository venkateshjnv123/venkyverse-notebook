import * as fs from "fs";
import * as path from "path";

const PUBLIC_IMAGES_DIR = path.resolve("public/images");
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "my-website-9842b.appspot.com";

function copyLocally(localPath: string, slug: string): string {
  const ext = path.extname(localPath).toLowerCase();
  fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
  const destName = `${slug}-hero${ext}`;
  fs.copyFileSync(localPath, path.join(PUBLIC_IMAGES_DIR, destName));
  process.stderr.write(`[firebase] copied locally → public/images/${destName}\n`);
  return `/images/${destName}`;
}

export async function uploadImage(localPath: string, slug: string): Promise<string> {
  const serviceAccountPath = path.resolve("firebase-service-account.json");

  if (!fs.existsSync(serviceAccountPath)) {
    process.stderr.write("[firebase] service account missing — falling back to local copy\n");
    return copyLocally(localPath, slug);
  }

  try {
    const { default: admin } = await import("firebase-admin");

    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: BUCKET,
      });
    }

    const ext = path.extname(localPath).toLowerCase();
    const dest = `images/${slug}/hero${ext}`;
    const bucket = admin.storage().bucket();

    await bucket.upload(localPath, {
      destination: dest,
      metadata: { contentType: `image/${ext.slice(1)}` },
      public: true,
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(dest)}?alt=media`;
    process.stderr.write(`[firebase] uploaded → ${url}\n`);
    return url;
  } catch (err) {
    process.stderr.write(`[firebase] upload failed: ${(err as Error).message} — falling back to local copy\n`);
    return copyLocally(localPath, slug);
  }
}
