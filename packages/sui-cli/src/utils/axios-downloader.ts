// Better download implementation using axios for improved proxy support
import chalk from 'chalk';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import axios from 'axios';

/**
 * Download file using axios with proper proxy support
 * This is a better alternative to the current fetchWithProxy implementation
 */
export async function downloadWithAxios(url: string, outputPath: string): Promise<void> {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;

  // Check NO_PROXY configuration
  if (noProxy) {
    const noProxyList = noProxy.split(',').map((item) => item.trim());
    const hostname = new URL(url).hostname;

    for (const noProxyItem of noProxyList) {
      if (
        noProxyItem === '*' ||
        hostname === noProxyItem ||
        hostname.endsWith('.' + noProxyItem) ||
        (noProxyItem.startsWith('.') && hostname.endsWith(noProxyItem))
      ) {
        // No proxy needed, use direct connection
        console.log(chalk.gray(`   Bypassing proxy for ${hostname} (NO_PROXY)`));
        const response = await axios.get(url, {
          responseType: 'stream',
          timeout: 30000,
          headers: { 'User-Agent': 'dubhe-cli' }
        });
        return streamToFile(response, outputPath);
      }
    }
  }

  let httpsAgent, httpAgent;
  let proxyUsed = false;
  let proxyUrl: string | undefined;

  // Create appropriate proxy agents based on available proxy settings
  if (httpsProxy) {
    proxyUrl = httpsProxy;
    try {
      new URL(httpsProxy); // Validate proxy URL
      httpsAgent = new HttpsProxyAgent(httpsProxy);
      proxyUsed = true;
      console.log(chalk.gray(`   Using HTTPS proxy: ${httpsProxy}`));
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️ Warning: Invalid HTTPS proxy URL: ${httpsProxy}`));
    }
  }

  if (httpProxy) {
    proxyUrl = proxyUrl || httpProxy;
    try {
      new URL(httpProxy); // Validate proxy URL
      httpAgent = new HttpProxyAgent(httpProxy);
      // For HTTPS requests through HTTP proxy, also create an HTTPS agent
      if (!httpsAgent) {
        httpsAgent = new HttpsProxyAgent(httpProxy);
        console.log(chalk.gray(`   Using HTTP proxy for HTTPS: ${httpProxy}`));
      } else {
        console.log(chalk.gray(`   Using HTTP proxy: ${httpProxy}`));
      }
      proxyUsed = true;
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️ Warning: Invalid HTTP proxy URL: ${httpProxy}`));
    }
  }

  if (!proxyUsed && (httpProxy || httpsProxy)) {
    console.log(chalk.gray(`   No proxy configured or proxy setup failed`));
  }

  try {
    const response = await axios.get(url, {
      httpsAgent,
      httpAgent,
      responseType: 'stream',
      timeout: 30000,
      headers: { 'User-Agent': 'dubhe-cli' },
      maxRedirects: 5,
      validateStatus: (status) => status < 400 // Accept all status codes < 400
    });

    await streamToFile(response, outputPath);
    console.log(
      chalk.green(`   ✓ Successfully downloaded using ${proxyUsed ? 'proxy' : 'direct'} connection`)
    );
  } catch (error: any) {
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      throw new Error(
        `Network error: ${error.message}. Please check your internet connection and proxy settings.`
      );
    } else if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    } else {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Download failed: ${errorMsg}`);
    }
  }
}

/**
 * Stream response data to file with progress bar
 */
async function streamToFile(response: any, outputPath: string): Promise<void> {
  const totalSize = parseInt(response.headers['content-length'] || '0');

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format:
      chalk.cyan('Download Progress') +
      ' |{bar}| {percentage}% | {value}/{total} MB | Speed: {speed} MB/s | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    barsize: 30,
    forceRedraw: true
  });

  if (totalSize > 0) {
    progressBar.start(Math.round((totalSize / 1024 / 1024) * 100) / 100, 0, {
      speed: '0.00'
    });
  } else {
    console.log(chalk.blue('📥 Downloading... (unable to get file size)'));
  }

  const writer = fs.createWriteStream(outputPath);
  let downloadedBytes = 0;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;

      if (totalSize > 0) {
        const downloadedMB = Math.round((downloadedBytes / 1024 / 1024) * 100) / 100;
        const elapsedTime = (Date.now() - startTime) / 1000;
        const speed = elapsedTime > 0 ? Math.round((downloadedMB / elapsedTime) * 100) / 100 : 0;

        progressBar.update(downloadedMB, {
          speed: speed.toFixed(2)
        });
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      if (totalSize > 0) {
        progressBar.stop();
      }

      const totalMB = Math.round((downloadedBytes / 1024 / 1024) * 100) / 100;
      const elapsedTime = (Date.now() - startTime) / 1000;
      const avgSpeed = elapsedTime > 0 ? Math.round((totalMB / elapsedTime) * 100) / 100 : 0;

      console.log(
        chalk.green(`✓ Download completed! ${totalMB} MB, average speed: ${avgSpeed} MB/s`)
      );
      resolve();
    });

    writer.on('error', (error) => {
      if (totalSize > 0) {
        progressBar.stop();
      }
      reject(error);
    });
  });
}

/**
 * Test proxy connectivity using axios
 */
export async function testProxyWithAxios(): Promise<{ success: boolean; message: string }> {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (!httpProxy && !httpsProxy) {
    return { success: true, message: 'No proxy configured' };
  }

  const testUrl = 'https://api.github.com/zen';
  let httpsAgent, httpAgent;

  // Create appropriate proxy agents based on available proxy settings
  if (httpsProxy) {
    try {
      new URL(httpsProxy);
      httpsAgent = new HttpsProxyAgent(httpsProxy);
    } catch (error: any) {
      return { success: false, message: `Invalid HTTPS proxy URL: ${httpsProxy}` };
    }
  }

  if (httpProxy) {
    try {
      new URL(httpProxy);
      httpAgent = new HttpProxyAgent(httpProxy);
      // For HTTPS requests through HTTP proxy, also create an HTTPS agent
      if (!httpsAgent) {
        httpsAgent = new HttpsProxyAgent(httpProxy);
      }
    } catch (error: any) {
      return { success: false, message: `Invalid HTTP proxy URL: ${httpProxy}` };
    }
  }

  try {
    await axios.get(testUrl, {
      httpsAgent,
      httpAgent,
      timeout: 10000,
      headers: { 'User-Agent': 'dubhe-cli-proxy-test' }
    });

    const proxyInfo = [];
    if (httpProxy) proxyInfo.push(`HTTP: ${httpProxy}`);
    if (httpsProxy) proxyInfo.push(`HTTPS: ${httpsProxy}`);

    return { success: true, message: `Proxy working correctly (${proxyInfo.join(', ')})` };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Proxy test failed: ${errorMsg}` };
  }
}
