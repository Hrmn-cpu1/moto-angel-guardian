package com.motoanjo.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Private no-backup storage; the encryption key never leaves Android Keystore. */
final class NativeProtectionStore {
    private static final String ALIAS = "moto_anjo_native_protection_v1";
    private final File file;
    NativeProtectionStore(Context context) { file = new File(context.getNoBackupFilesDir(), "native-protection.enc"); }
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            return g.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }
    synchronized void save(JSONObject state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject envelope = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("data", Base64.encodeToString(cipher.doFinal(state.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP));
        File temp = new File(file.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(envelope.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); out.getFD().sync();
        }
        if (!temp.renameTo(file)) throw new java.io.IOException("Não foi possível preservar o pedido.");
    }
    synchronized JSONObject read() throws Exception {
        if (!file.exists()) return null;
        if (file.length() > 32_768) throw new java.io.IOException("Estado inválido.");
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream in = new FileInputStream(file)) {
            int offset = 0, count; while (offset < bytes.length && (count = in.read(bytes, offset, bytes.length - offset)) > 0) offset += count;
            if (offset != bytes.length) throw new java.io.IOException("Estado incompleto.");
        }
        JSONObject envelope = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
    }
    synchronized void clear() { file.delete(); new File(file.getPath() + ".tmp").delete(); }
}
