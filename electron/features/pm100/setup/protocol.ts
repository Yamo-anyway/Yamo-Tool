export type PM100SetupFrame = {
  deviceIp: string;
  subnet: string;
  gateway: string;
  serverIp: string;
  serverPort: number;

  sensorNcNo: [number, number, number];
  sensorEnable: [number, number, number];
  sensorCheckTime: [number, number, number];
  sensorStatus: [number, number, number];

  // 나중에 쓸 “원본 유지”
  raw: Buffer;
};

const FRAME_LEN = 36;

function ip(buf: Buffer, off: number) {
  return `${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`;
}

function u16be(buf: Buffer, off: number) {
  return (buf[off] << 8) | buf[off + 1];
}

// ✅ checksum 방식이 “xor”라고 가정 (앞에서 discovery도 xor였으니)
// 만약 방식이 다르면 여기만 바꾸면 됨.
function xorChecksum(buf: Buffer) {
  let x = 0;
  for (let i = 0; i < buf.length - 1; i++) x ^= buf[i];
  return x & 0xff;
}

export function tryParseFrames(chunk: Buffer): {
  frames: PM100SetupFrame[];
  rest: Buffer;
} {
  // 여기서는 “버퍼 누적”을 server.ts에서 하므로
  // 이 함수는 단순히 프레임 단위로 잘라 파싱만 해도 됨.
  const frames: PM100SetupFrame[] = [];
  let offset = 0;

  while (offset + FRAME_LEN <= chunk.length) {
    // 헤더 검사
    if (
      chunk[offset] !== 0x43 || // 'C'
      chunk[offset + 1] !== 0x47 || // 'G'
      chunk[offset + 2] !== 0x44 || // 'D'
      chunk[offset + 3] !== 0x49 || // 'I'
      chunk[offset + 4] !== 0x7f
    ) {
      // 헤더 찾기: 1바이트씩 밀면서 재시도
      offset += 1;
      continue;
    }

    const frameBuf = chunk.slice(offset, offset + FRAME_LEN);

    // checksum 검사(옵션)
    const expected = frameBuf[FRAME_LEN - 1];
    const actual = xorChecksum(frameBuf);
    if (expected !== actual) {
      // checksum 불일치면 일단 스킵하고 다음 헤더 탐색
      offset += 1;
      continue;
    }

    // 오프셋 파싱
    // 0..4 header
    const deviceIp = ip(frameBuf, 5);
    const subnet = ip(frameBuf, 9);
    const gateway = ip(frameBuf, 13);
    const serverIp = ip(frameBuf, 17);
    const serverPort = u16be(frameBuf, 21);

    const sensorNcNo: [number, number, number] = [
      frameBuf[23],
      frameBuf[24],
      frameBuf[25],
    ];
    const sensorEnable: [number, number, number] = [
      frameBuf[26],
      frameBuf[27],
      frameBuf[28],
    ];
    const sensorCheckTime: [number, number, number] = [
      frameBuf[29],
      frameBuf[30],
      frameBuf[31],
    ];
    const sensorStatus: [number, number, number] = [
      frameBuf[32],
      frameBuf[33],
      frameBuf[34],
    ];

    frames.push({
      deviceIp,
      subnet,
      gateway,
      serverIp,
      serverPort,
      sensorNcNo,
      sensorEnable,
      sensorCheckTime,
      sensorStatus,
      raw: frameBuf,
    });

    offset += FRAME_LEN;
  }

  return { frames, rest: chunk.slice(offset) as Buffer };
}
