package com.yamo.snorelab;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public final class WavWriter {
    private WavWriter() {}

    public static void writePcm16Mono(File file, byte[] pcmLittleEndian, int sampleRate) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            int dataSize = pcmLittleEndian.length;
            int byteRate = sampleRate * 2;
            writeAscii(out, "RIFF");
            writeIntLE(out, 36 + dataSize);
            writeAscii(out, "WAVE");
            writeAscii(out, "fmt ");
            writeIntLE(out, 16);
            writeShortLE(out, 1);
            writeShortLE(out, 1);
            writeIntLE(out, sampleRate);
            writeIntLE(out, byteRate);
            writeShortLE(out, 2);
            writeShortLE(out, 16);
            writeAscii(out, "data");
            writeIntLE(out, dataSize);
            out.write(pcmLittleEndian);
        }
    }

    private static void writeAscii(FileOutputStream out, String s) throws IOException {
        out.write(s.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }

    private static void writeIntLE(FileOutputStream out, int v) throws IOException {
        out.write(v & 0xff);
        out.write((v >> 8) & 0xff);
        out.write((v >> 16) & 0xff);
        out.write((v >> 24) & 0xff);
    }

    private static void writeShortLE(FileOutputStream out, int v) throws IOException {
        out.write(v & 0xff);
        out.write((v >> 8) & 0xff);
    }
}
