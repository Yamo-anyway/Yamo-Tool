package com.yamo.snorelab;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Simple PCM16 mono -> AAC-LC in MP4/M4A encoder. */
public final class AacM4aEncoder implements AutoCloseable {
    private final int sampleRate;
    private final MediaCodec codec;
    private final MediaMuxer muxer;
    private final MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
    private int trackIndex = -1;
    private boolean muxerStarted = false;
    private boolean closed = false;
    private long totalSamples = 0L;

    public AacM4aEncoder(File output, int sampleRate, int bitrate) throws IOException {
        this.sampleRate = sampleRate;
        MediaFormat format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);

        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        codec.start();
        muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
    }

    public void encode(short[] pcm, int length) {
        int offset = 0;
        while (offset < length && !closed) {
            int inputIndex = codec.dequeueInputBuffer(20_000);
            if (inputIndex < 0) {
                drain(false);
                continue;
            }
            ByteBuffer input = codec.getInputBuffer(inputIndex);
            if (input == null) continue;
            input.clear();
            input.order(ByteOrder.LITTLE_ENDIAN);
            int samples = Math.min(length - offset, input.remaining() / 2);
            for (int i = 0; i < samples; i++) input.putShort(pcm[offset + i]);
            long ptsUs = totalSamples * 1_000_000L / sampleRate;
            codec.queueInputBuffer(inputIndex, 0, samples * 2, ptsUs, 0);
            totalSamples += samples;
            offset += samples;
            drain(false);
        }
    }

    private void drain(boolean waitForEos) {
        int idle = 0;
        while (true) {
            int outIndex = codec.dequeueOutputBuffer(bufferInfo, waitForEos ? 20_000 : 0);
            if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!waitForEos || ++idle > 50) break;
            } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (muxerStarted) throw new IllegalStateException("AAC output format changed twice");
                trackIndex = muxer.addTrack(codec.getOutputFormat());
                muxer.start();
                muxerStarted = true;
            } else if (outIndex >= 0) {
                ByteBuffer out = codec.getOutputBuffer(outIndex);
                if (out != null) {
                    if ((bufferInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) bufferInfo.size = 0;
                    if (bufferInfo.size > 0 && muxerStarted) {
                        out.position(bufferInfo.offset);
                        out.limit(bufferInfo.offset + bufferInfo.size);
                        muxer.writeSampleData(trackIndex, out, bufferInfo);
                    }
                }
                boolean eos = (bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                codec.releaseOutputBuffer(outIndex, false);
                if (eos) break;
            }
        }
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        try {
            int inputIndex = codec.dequeueInputBuffer(20_000);
            if (inputIndex >= 0) {
                long ptsUs = totalSamples * 1_000_000L / sampleRate;
                codec.queueInputBuffer(inputIndex, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                drain(true);
            }
        } catch (Exception ignored) {
        }
        try { codec.stop(); } catch (Exception ignored) {}
        try { codec.release(); } catch (Exception ignored) {}
        if (muxerStarted) {
            try { muxer.stop(); } catch (Exception ignored) {}
        }
        try { muxer.release(); } catch (Exception ignored) {}
    }
}
