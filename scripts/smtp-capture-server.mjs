/**
 * 零相依本機 SMTP 攔截：解碼 MIME 主旨／內文後寫檔，供巡堂會辦 E2E 驗證寄信。
 * 用法：node scripts/smtp-capture-server.mjs [port] [outDir]
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 2525);
const outDir = process.argv[3] || '/tmp/patrol-e2e-mail';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.json'), '[]\n');

function decodeMimeWord(value) {
  return String(value || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _cs, enc, data) => {
    if (enc.toUpperCase() === 'B') {
      return Buffer.from(data, 'base64').toString('utf8');
    }
    const q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
    return q;
  });
}

function decodeQuotedPrintable(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractBody(rawText) {
  const headerEnd = rawText.indexOf('\r\n\r\n');
  const body = headerEnd >= 0 ? rawText.slice(headerEnd + 4) : rawText;
  // multipart：找 text/plain base64 或 qp
  const plainB64 = body.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r\n(?:Content-Transfer-Encoding:\s*base64\r\n)?(?:[\w-]+:[^\r\n]*\r\n)*\r\n([A-Za-z0-9+/=\r\n]+)/i
  );
  if (/Content-Transfer-Encoding:\s*base64/i.test(body) && plainB64) {
    try {
      return Buffer.from(plainB64[1].replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      /* fallthrough */
    }
  }
  const plainQp = body.match(
    /Content-Type:\s*text\/plain[\s\S]*?Content-Transfer-Encoding:\s*quoted-printable\r\n[\s\S]*?\r\n\r\n([\s\S]*?)(?=\r\n--|$)/i
  );
  if (plainQp) return decodeQuotedPrintable(plainQp[1]);
  if (/Content-Transfer-Encoding:\s*base64/i.test(body)) {
    const m = body.match(/\r\n\r\n([A-Za-z0-9+/=\r\n]+)/);
    if (m) {
      try {
        return Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch {
        /* fallthrough */
      }
    }
  }
  return body.replace(/\r\n/g, '\n').trim();
}

function pushMail(entry) {
  const indexPath = path.join(outDir, 'index.json');
  const list = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  list.push(entry);
  fs.writeFileSync(indexPath, JSON.stringify(list, null, 2));
  const file = path.join(outDir, `mail_${String(list.length).padStart(3, '0')}.json`);
  fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  console.log(`[smtp-capture] #${list.length} to=${entry.to.join(',')} subject=${entry.subject}`);
}

function parseRaw(raw) {
  const text = raw.toString('utf8');
  const headerEnd = text.indexOf('\r\n\r\n');
  const header = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  // 展開 folded header（換行後空白續行）
  const unfolded = header.replace(/\r\n[ \t]+/g, ' ');
  const get = (name) => {
    const re = new RegExp(`^${name}:\\s*(.*)$`, 'im');
    const m = unfolded.match(re);
    return m ? m[1].trim() : '';
  };
  const toLine = get('To');
  const to = toLine
    ? toLine
        .split(',')
        .map((s) => (s.match(/<([^>]+)>/) || [, s.trim()])[1].trim())
        .filter(Boolean)
    : [];
  return {
    receivedAt: new Date().toISOString(),
    from: decodeMimeWord(get('From')),
    to,
    subject: decodeMimeWord(get('Subject')),
    text: extractBody(text),
    html: '',
  };
}

const server = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  let mode = 'cmd';
  const envelopeTo = [];
  const write = (line) => socket.write(line + '\r\n');
  write('220 localhost ESMTP capture');

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (mode === 'data') {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) return;
        const dataBuf = buf.subarray(0, end);
        buf = buf.subarray(end + 5);
        try {
          const entry = parseRaw(dataBuf);
          if (!entry.to.length && envelopeTo.length) entry.to = [...envelopeTo];
          pushMail(entry);
          write('250 OK');
        } catch (err) {
          write('554 ' + (err instanceof Error ? err.message : 'store failed'));
        }
        mode = 'cmd';
        continue;
      }

      const idx = buf.indexOf('\r\n');
      if (idx < 0) return;
      const line = buf.subarray(0, idx).toString('utf8');
      buf = buf.subarray(idx + 2);
      const upper = line.toUpperCase();

      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        write('250-localhost');
        write('250 OK');
      } else if (upper.startsWith('MAIL FROM:')) {
        write('250 OK');
      } else if (upper.startsWith('RCPT TO:')) {
        const m = line.match(/<([^>]+)>/);
        if (m) envelopeTo.push(m[1]);
        write('250 OK');
      } else if (upper === 'DATA') {
        mode = 'data';
        write('354 End data with <CR><LF>.<CR><LF>');
      } else if (upper === 'RSET') {
        envelopeTo.length = 0;
        write('250 OK');
      } else if (upper === 'QUIT') {
        write('221 Bye');
        socket.end();
        return;
      } else if (upper === 'NOOP') {
        write('250 OK');
      } else {
        write('250 OK');
      }
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[smtp-capture] listening on 127.0.0.1:${port} → ${outDir}`);
});
