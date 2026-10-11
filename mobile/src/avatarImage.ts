import { Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat, type Action } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

export type AvatarImage = { uri: string; width: number; height: number };
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function validateFile(size?: number, type?: string | null) {
  if (size && size > MAX_FILE_SIZE) throw new Error('Choose a photo smaller than 10 MB.');
  if (type && !allowedTypes.includes(type)) throw new Error('Choose a JPG, PNG, WebP or HEIC photo.');
}

function pickWebImage(): Promise<AvatarImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = allowedTypes.join(','); input.style.display = 'none';
    input.oncancel = () => { input.remove(); resolve(null); };
    input.onchange = async () => {
      let uri: string | undefined;
      try {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        validateFile(file.size, file.type);
        uri = URL.createObjectURL(file);
        const dimensions = await new Promise<{ width: number; height: number }>((done, fail) => Image.getSize(uri!, (width, height) => done({ width, height }), fail));
        resolve({ uri, ...dimensions });
      } catch (error) {
        if (uri) URL.revokeObjectURL(uri);
        reject(error instanceof Error && /Choose a/.test(error.message) ? error : new Error('This photo could not be opened. Try a JPG or PNG image.'));
      } finally { input.remove(); }
    };
    document.body.appendChild(input);
    input.click();
  });
}

function revokeBlob(uri?: string) { if (Platform.OS === 'web' && uri?.startsWith('blob:')) URL.revokeObjectURL(uri); }

// Both platforms use the same re-encoding/cropping path. No image is sent to a server.
export async function editAvatarImage(uri: string, actions: Action[] = []): Promise<AvatarImage> {
  const context = ImageManipulator.manipulate(uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let temporaryUri: string | undefined;
  try {
    for (const action of actions) {
      if ('crop' in action) context.crop(action.crop);
      if ('resize' in action) context.resize(action.resize);
      if ('rotate' in action) context.rotate(action.rotate);
    }
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: .85, base64: true });
    temporaryUri = result.uri;
    if (!result.base64) throw new Error('The photo could not be processed. Please choose it again.');
    return { uri: `data:image/jpeg;base64,${result.base64}`, width: result.width, height: result.height };
  } finally {
    if (Platform.OS === 'web') {
      revokeBlob(temporaryUri);
      if (rendered && 'uri' in rendered && typeof rendered.uri === 'string') revokeBlob(rendered.uri);
    } else if (temporaryUri) {
      try { const file = new File(temporaryUri); if (file.exists) file.delete(); } catch { /* The OS may have cleared this generated cache file. */ }
    }
    rendered?.release(); context.release();
  }
}

export async function chooseAvatarImage(): Promise<AvatarImage | null> {
  // Call the browser picker synchronously from the user's click; no permission await precedes it.
  const result = Platform.OS === 'web' ? await pickWebImage() : await (async () => {
    const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, exif: false, quality: 1 });
    if (selection.canceled) return null;
    const asset = selection.assets[0];
    validateFile(asset.fileSize, asset.mimeType);
    return asset;
  })();
  if (!result) return null;
  try {
    if (!Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width <= 0 || result.height <= 0) throw new Error('This photo could not be opened. Try a JPG or PNG image.');
    if (result.width * result.height > 40_000_000) throw new Error('Choose a photo with fewer than 40 megapixels.');
    const resize = Math.max(result.width, result.height) > 1600 ? [{ resize: result.width >= result.height ? { width: 1600 } : { height: 1600 } }] : [];
    return await editAvatarImage(result.uri, resize);
  } finally { revokeBlob(result.uri); }
}
