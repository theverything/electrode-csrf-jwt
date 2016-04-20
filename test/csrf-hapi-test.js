"use strict";

const Hapi = require("hapi");
const csrfPlugin = require("../").register;

const chai = require("chai");
const expect = chai.expect;
const jwt = require("jsonwebtoken");

let server;
const secret = "test";

describe("test register", () => {
  it("should fail with bad options", () => {
    server = new Hapi.Server();
    server.connection();

    server.register({register: csrfPlugin}, (err) => {
      expect(err.message).to.equal("MISSING_SECRET");
    });
  });
});

describe("test csrf-jwt hapi plugin", () => {
  before(() => {
    server = new Hapi.Server();
    server.connection();

    const options = {
      secret,
      expiresIn: "2d",
      ignoreThisParam: "ignore"
    };

    server.register({register: csrfPlugin, options}, (err) => {
      expect(err).to.not.exist;

      server.register(require("vision"), (err) => {
        expect(err).to.not.exist;

        server.views({
          engines: {
            html: require("handlebars")
          },
          relativeTo: __dirname,
          path: "templates"
        });

        server.route([
          {
            method: "get",
            path: "/1",
            handler: (request, reply) => {
              expect(request.app.jwt).to.exist;
              return reply.view("index", {message: "hi", jwt: request.app.jwt});
            }
          },
          {
            method: "post",
            path: "/2",
            handler: (request, reply) => {
              expect(request.payload.message).to.equal("hello");
              return reply("valid");
            }
          },
          {
            method: "get",
            path: "/js/bundle",
            handler: (request, reply) => {
              expect(request.app.jwt).to.not.exist;
              return reply("");
            }
          },
          {
            method: "post",
            path: "/skip",
            handler: (request, reply) => {
              return reply("valid");
            },
            config: {
              plugins: {
                "@walmart/csrf-jwt": {
                  enabled: false
                }
              }
            }
          }
        ]);
      });
    });
  });

  it("should return success", () => {
    return server.inject({method: "get", url: "/1"})
      .then((res) => {
        const token = res.request.app.jwt;
        expect(res.statusCode).to.equal(200);
        expect(res.payload).to.contain("hi");
        expect(res.headers["x-csrf-jwt"]).to.equal(token);
        expect(res.headers["set-cookie"][0]).to.contain("jwt=");
        return server.inject({
          method: "post",
          url: "/2",
          payload: {message: "hello"},
          headers: {"x-csrf-jwt": token, Cookie: res.headers["set-cookie"][0]}
        }).then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.headers["x-csrf-jwt"]).to.exist;
          expect(res.headers["set-cookie"][0]).to.contain("x-csrf-jwt=");
          expect(res.result).to.equal("valid");

        });
      })
      .catch((err) => {
        expect(err).to.not.exist;
      });
  });

  it("should not create token for /js/ route", () => {
    return server.inject({method: "get", url: "/js/bundle"})
      .then((res) => {
        expect(res.headers["x-csrf-jwt"]).to.not.exist;
        expect(res.request.app.jwt).to.not.exist;

      })
      .catch((err) => {
        expect(err).to.not.exist;
      });
  });

  it("should return 400 for missing jwt", () => {
    server.inject({method: "post", url: "/2", payload: {message: "hello"}})
      .then((err) => {
        expect(err.statusCode).to.equal(400);
        expect(res.result.message).to.equal("INVALID_JWT");
      });
  });

  it("should return 400 for invalid jwt", () => {
    return server.inject({method: "get", url: "/1"})
      .then((res) => {
        const token = res.request.app.jwt;
        return server.inject({
          method: "post",
          url: "/2",
          payload: {message: "hello"},
          headers: {"x-csrf-jwt": token, Cookie: `x-csrf-jwt=${token}`}
        }).then((res) => {
          expect(res.statusCode).to.equal(400);
          expect(res.result.message).to.equal("INVALID_JWT");
        });
      })
      .catch((err) => {
        expect(err).to.not.exist;
      });
  });

  it("should skip csrf check", () => {
    return server.inject({method: "get", url: "/1"})
      .then((res) => {
        const token = res.request.app.jwt;
        expect(res.statusCode).to.equal(200);
        expect(res.payload).to.contain("hi");
        expect(res.headers["x-csrf-jwt"]).to.equal(token);
        expect(res.headers["set-cookie"][0]).to.contain("jwt=");
        return server.inject({
          method: "post",
          url: "/skip",
          payload: {message: "hello"}
        }).then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.result).to.equal("valid");
        }).then(() => {
          return server.inject({
            method: "post",
            url: "/2",
            payload: {message: "hello"},
            headers: {"x-csrf-jwt": token, Cookie: res.headers["set-cookie"][0]}
          }).then((res) => {
            expect(res.statusCode).to.equal(200);
            expect(res.headers["x-csrf-jwt"]).to.exist;
            expect(res.headers["set-cookie"][0]).to.contain("x-csrf-jwt=");
            expect(res.result).to.equal("valid");
          });
        });
      }).catch((err) => {
        expect(err).to.not.exist;
      });
  });
});
