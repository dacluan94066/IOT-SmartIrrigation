// Chạy bằng Node có sẵn của Backend; không thêm dependency hoặc dùng credential.
// node --test test/weather-certificates.test.mjs
// WEATHER_TLS_LIVE_TESTS=1 bật kiểm tra Internet trên PC, KHÔNG phải Wokwi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import https from 'node:https';
import { checkServerIdentity } from 'node:tls';

const header = readFileSync(new URL('../include/WeatherCertificates.h', import.meta.url), 'utf8');
const bundle = header.match(/R"PEM\(([\s\S]*?)\)PEM"/)?.[1];
assert.ok(bundle, 'PEM bundle must exist in production header');
const pem = [...bundle.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map(m => m[0]);
const roots = pem.map(value => new X509Certificate(value));
const fingerprints = [
  '96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6',
  '69:72:9B:8E:15:A8:6E:FC:17:7A:57:AF:B7:17:1D:FC:64:AD:D2:8C:2F:CA:8C:F1:50:7E:34:45:3C:CB:14:70',
];

test('Production bundle contains exactly the official self-signed X1 and X2 roots', () => {
  assert.equal(roots.length, 2);
  assert.deepEqual(roots.map(c => c.fingerprint256).sort(), [...fingerprints].sort());
  for (const root of roots) {
    assert.equal(root.ca, true);
    assert.equal(root.subject, root.issuer);
    assert.equal(root.verify(root.publicKey), true);
  }
  assert.equal(bundle.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim(), '');
});

test('Both bundled CA certificates are within their certificate validity period', () => {
  for (const root of roots) {
    assert.ok(Date.now() >= Date.parse(root.validFrom), `${root.subject}: not valid yet`);
    assert.ok(Date.now() < Date.parse(root.validTo), `${root.subject}: expired`);
  }
});

test('Production transport retains mandatory chain, hostname and verification-result checks (source invariant)', () => {
  const source = readFileSync(new URL('../src/WeatherTransport.cpp', import.meta.url), 'utf8');
  assert.match(source, /mbedtls_ssl_conf_authmode\(&tls_->config, MBEDTLS_SSL_VERIFY_REQUIRED\)/);
  assert.match(source, /mbedtls_ssl_set_hostname\(&tls_->ssl, hostname\)/);
  assert.match(source, /verifyFlags_ != 0/);
  assert.match(source, /mbedtls_x509_crt_parse\(&tls_->ca/);
  assert.doesNotMatch(source, /setInsecure\s*\(|MBEDTLS_SSL_VERIFY_NONE/);
});

const live = process.env.WEATHER_TLS_LIVE_TESTS === '1';
function get(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      // Mỗi test bắt tay mới: không để session cache của Node bỏ qua callback kiểm tra tên.
      agent: false, ca: bundle, rejectUnauthorized: true, maxVersion: 'TLSv1.2', ...options,
    }, res => {
      const socket = res.socket;
      const peer = socket.getPeerCertificate(true);
      const authorized = socket.authorized;
      let body = '';
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 32768) req.destroy(new Error('Diagnostic response exceeds cap'));
      });
      res.on('error', reject);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, authorized, peer, body });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('PC TLS diagnostic timeout after 12s')), 12000);
    req.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

for (const [name, url] of [
  ['ISRG Root X1', 'https://valid.x1.test-certs.letsencrypt.org/'],
  ['ISRG Root X2', 'https://valid.x2.test-certs.letsencrypt.org/'],
]) {
  test(`PC LIVE: bundle validates ${name} official test endpoint (not Wokwi)`, { skip: !live }, async () => {
    const response = await get(url);
    assert.equal(response.authorized, true);
    assert.equal(response.status, 200);
  });
}

const apiUrl = 'https://api.open-meteo.com/v1/forecast?latitude=10.8231&longitude=106.6297&hourly=precipitation_probability,precipitation&current=temperature_2m,relative_humidity_2m&forecast_hours=3&timezone=Asia%2FHo_Chi_Minh&timeformat=unixtime&temperature_unit=celsius&precipitation_unit=mm';
test('PC LIVE: real Open-Meteo HTTPS succeeds with the production CA bundle (not Wokwi)', { skip: !live }, async () => {
  const response = await get(apiUrl);
  assert.equal(response.authorized, true);
  assert.equal(response.status, 200);
  const json = JSON.parse(response.body);
  assert.equal(typeof json.current.temperature_2m, 'number');
  assert.equal(json.hourly.precipitation_probability.length, 3);
  assert.ok(new X509Certificate(response.peer.raw).checkHost('api.open-meteo.com'));
  console.log('PC LIVE Open-Meteo:', JSON.stringify({
    http: response.status, temperatureC: json.current.temperature_2m,
    rain: json.hourly.precipitation_probability, issuer: response.peer.issuer?.CN,
  }));
});

test('PC LIVE: a wrong hostname is still rejected with the production CA bundle', { skip: !live }, async () => {
  let checked = false;
  await assert.rejects(get(apiUrl, {
    checkServerIdentity: (_host, certificate) => {
      checked = true;
      return checkServerIdentity('wrong-host.invalid', certificate);
    },
  }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  assert.equal(checked, true, 'Negative test must exercise a fresh hostname verification');
});
