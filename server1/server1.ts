// Start listening on port 8080 of localhost.
const server = Deno.listen({ port: 8080 });
console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);
const encoder = new TextEncoder();

// Something happening on the server
let count = 0;
setInterval(() => {
  count++;
}, 1000);

// Connections to the server will be yielded up as an async iterable.
for await (const conn of server) {
  // In order to not be blocking, we need to handle each connection individually
  // without awaiting the function
  serveHttp(conn);
}

async function serveHttp(conn: Deno.Conn) {
  // This "upgrades" a network connection into an HTTP connection.
  const httpConn = Deno.serveHttp(conn);
  // Each request sent over the HTTP connection will be yielded as an async
  // iterator from the HTTP connection.
  for await (const requestEvent of httpConn) {
    let interval = 0;
    if (requestEvent.request.url.includes("/stream")) {
      const stream = new ReadableStream({
        start: (c) => {
          interval = setInterval(() => {
            c.enqueue(encoder.encode(`event: ping\ndata: ping${count}\n\n`));
          }, 1000);
        },
      });

      return requestEvent
        .respondWith(
          new Response(stream, {
            headers: {
              "content-type": "text/event-stream",
              connection: "keep-alive",
            },
          })
        )
        .catch((e) => {
          if (e) {
            clearInterval(interval);
            if (e === "connection closed before message completed") {
              console.error("connection closed, stopping response");
            }
          }
        });
    }

    if (requestEvent.request.url.includes("/ws")) {
      if (requestEvent.request.headers.get("upgrade") != "websocket") {
        return requestEvent
          .respondWith(new Response("hello", { status: 501 }))
          .catch((e) => console.log("no ws: ", e));
      }

      const { socket, response } = Deno.upgradeWebSocket(requestEvent.request);
      socket.addEventListener("open", () => {
        console.log("a client connected!");
      });
      socket.addEventListener("message", (event) => {
        if (event.data === "ping") {
          socket.send("pong");
        }
      });

      return requestEvent.respondWith(response);
    }
  }
}
