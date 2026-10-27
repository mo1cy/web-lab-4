import http from 'http';
import fs from 'fs';
import { program } from 'commander';

// 1. Налаштування параметрів командного рядка
program
  .helpOption('--help', 'Відобразити довідку') // Усуваємо конфлікт з -h
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл, у який записується остання надіслана відповідь');

program.parse();
const options = program.opts();

// 2. Перевірка наявності файлу (через колбек-API)
fs.access(options.input, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }

  // 3. Створення сервера
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${options.host}:${options.port}`);

    // Перевірка маршруту
    if (url.pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: Маршрут не знайдено');
      return;
    }

    // Читання файлу при кожному запиті (асинхронно)
    fs.readFile(options.input, 'utf8', (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500: Помилка читання файлу даних');
        return;
      }

      try {
        // Парсинг NDJSON (кожен рядок - окремий об'єкт)
        const lines = data.split('\n').filter(line => line.trim() !== '');
        let records = lines.map(line => JSON.parse(line));

        // Обробка параметрів запиту для Варіанта 4
        const showVariety = url.searchParams.get('variety') === 'true';
        const minPetalLengthStr = url.searchParams.get('min_petal_length');

        if (minPetalLengthStr !== null) {
          const minPetalLength = Number(minPetalLengthStr);
          if (isNaN(minPetalLength)) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('400: Параметр min_petal_length має бути числом');
            return;
          }
          records = records.filter(r => r['petal.length'] > minPetalLength);
        }

        // Формування масиву результатів із потрібними полями
        const result = records.map(r => {
          const obj = {
            petal_length: r['petal.length'],
            petal_width: r['petal.width']
          };
          if (showVariety) {
            obj.variety = r['variety'];
          }
          return obj;
        });

        const responseJson = JSON.stringify(result, null, 2);

        // Запис у файл, якщо вказано опцію --output
        if (options.output) {
          fs.writeFile(options.output, responseJson, 'utf8', (writeErr) => {
            if (writeErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('500: Помилка запису у файл виводу');
              return;
            }
            sendSuccessResponse(res, responseJson);
          });
        } else {
          sendSuccessResponse(res, responseJson);
        }

      } catch (parseErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500: Помилка обробки вмісту файлу');
      }
    });
  });

  // Запуск сервера
  server.listen(options.port, options.host, () => {
    console.log(`Server started at http://${options.host}:${options.port}`);
  });
});

// Допоміжна функція для надсилання успішної відповіді
function sendSuccessResponse(res, jsonData) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(jsonData);
}