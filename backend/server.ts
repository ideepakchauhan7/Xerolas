import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import fs from 'node:fs';
import { handleBackendRequest } from './handlers';
import { createNodeBackendRuntimeContext } from './node-runtime';

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (!req.method || req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestHeadersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  return headers;
}

async function toWebRequest(
  req: IncomingMessage,
  origin: string
): Promise<Request> {
  const body = await readRequestBody(req);

  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method ?? 'GET',
    headers: requestHeadersFromNode(req),
    body
  });
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

const runtimeContext = createNodeBackendRuntimeContext();
const protocol = runtimeContext.config.tlsCertPath && runtimeContext.config.tlsKeyPath ? 'https' : 'http';

async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = `${protocol}://${runtimeContext.config.host}:${runtimeContext.config.port}`;
  const request = await toWebRequest(req, origin);
  const response = await handleBackendRequest(request, runtimeContext);
  await writeWebResponse(response, res);
}

const server =
  runtimeContext.config.tlsCertPath && runtimeContext.config.tlsKeyPath
    ? createHttpsServer(
        {
          cert: fs.readFileSync(runtimeContext.config.tlsCertPath),
          key: fs.readFileSync(runtimeContext.config.tlsKeyPath)
        },
        (req, res) => {
          void requestHandler(req, res).catch((error) => {
            void writeWebResponse(
              new Response(
                `${JSON.stringify({
                  message: error instanceof Error ? error.message : 'Unexpected backend failure.'
                })}\n`,
                {
                  status: 500,
                  headers: { 'Content-Type': 'application/json; charset=utf-8' }
                }
              ),
              res
            );
          });
        }
      )
    : createHttpServer((req, res) => {
        void requestHandler(req, res).catch((error) => {
          void writeWebResponse(
            new Response(
              `${JSON.stringify({
                message: error instanceof Error ? error.message : 'Unexpected backend failure.'
              })}\n`,
              {
                status: 500,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
              }
            ),
            res
          );
        });
      });

server.listen(runtimeContext.config.port, runtimeContext.config.host, () => {
  console.log(
    `Xerolas backend listening on ${protocol}://${runtimeContext.config.host}:${runtimeContext.config.port}`
  );
});
