const https = require('https');
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'public', 'images', 'neural-network');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const images = [
  {
    name: 'neural-network-overview.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Neural_Network.svg?width=1200'
  },
  {
    name: 'artificial-neuron.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Artificial_neuron_structure.svg?width=1200'
  },
  {
    name: 'activation-functions.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/ActivationFunctions.svg?width=1200'
  },
  {
    name: 'decision-boundary.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kernel_Machine.svg?width=1200'
  },
  {
    name: 'gradient-descent.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Gradient_descent.svg?width=1200'
  },
  {
    name: 'loss-curve.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Overfitting_svg.svg?width=1200'
  },
  {
    name: 'cnn-architecture.png',
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Typical_cnn.png?width=1200'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'EpochLabEducationalBot/1.0 (https://epochlab.org; contact@epochlab.org)'
      }
    };

    https.get(options, (res) => {
      // Handle redirect (e.g. 301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = 'https://' + parsedUrl.hostname + redirectUrl;
        }
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status code ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          const stats = fs.statSync(dest);
          resolve(stats.size);
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading educational PNG assets to:', targetDir);
  for (const img of images) {
    const dest = path.join(targetDir, img.name);
    try {
      console.log(`Downloading ${img.name}...`);
      const bytes = await downloadFile(img.url, dest);
      console.log(`  ✓ ${img.name} saved (${bytes} bytes)`);
    } catch (err) {
      console.error(`  ✗ Error downloading ${img.name}:`, err.message);
    }
  }
  console.log('Finished downloading assets.');
}

run();
