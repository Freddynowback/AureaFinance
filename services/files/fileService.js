/**
 * Archivos del usuario mediante el selector del sistema (Storage Access
 * Framework): la app no pide permisos de almacenamiento. Los temporales se
 * escriben en la caché privada y se borran tras guardar.
 */
import { pick, keepLocalCopy, saveDocuments, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';

export class PickCancelled extends Error {}

/** Abre el selector y devuelve { name, text } de un CSV/TXT. */
export async function pickTextFile() {
  let picked;
  try {
    [picked] = await pick({ type: [types.csv, types.plainText, 'text/comma-separated-values', 'application/vnd.ms-excel'] });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) throw new PickCancelled();
    throw e;
  }
  const [copy] = await keepLocalCopy({
    files: [{ uri: picked.uri, fileName: picked.name || 'importacion.csv' }],
    destination: 'cachesDirectory',
  });
  if (copy.status !== 'success') throw new Error(copy.copyError || 'No se pudo leer el archivo');
  const path = decodeURIComponent(copy.localUri.replace('file://', ''));
  try {
    const size = (await RNFS.stat(path)).size;
    if (size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB');
    const text = await RNFS.readFile(path, 'utf8');
    return { name: picked.name, text };
  } finally {
    RNFS.unlink(path).catch(() => {});
  }
}

/**
 * Guarda texto donde el usuario elija (consentimiento explícito: el sistema
 * muestra el diálogo "Guardar como"). Nada se escribe en carpetas públicas
 * sin que el usuario lo decida.
 */
export async function saveTextFile(fileName, text, mimeType = 'text/csv') {
  const tmp = `${RNFS.CachesDirectoryPath}/${Date.now()}-${fileName}`;
  await RNFS.writeFile(tmp, text, 'utf8');
  try {
    const [res] = await saveDocuments({ sourceUris: ['file://' + tmp], mimeType, fileName, copy: true });
    if (res.error) throw new Error(res.error);
    return res;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) throw new PickCancelled();
    throw e;
  } finally {
    RNFS.unlink(tmp).catch(() => {});
  }
}
