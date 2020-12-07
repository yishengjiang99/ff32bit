import { Float32Radio } from "./index.js";

describe("Float32Radio", () => {
  const fp = new Float32Radio();

  it("it is instantiatable", () => {
    chai.expect(fp.playNow).exist;
  });
  it("it loads processor and worker", (done) => {
    alert("click to contineu");
    window.addEventListener(
      "click",
      () => {
        fp.setup().then(() => {
          chai.expect(fp.worker).to.exist;
          done();
        });
      },
      { once: true }
    );
  }).timeout(30002);
  it("can queue urls", (done) => {
    fp.queue("/samples/A4hifi.pcm");
    fp.worker.onmessage = ({ data: { msg } }) => {
      done();
    };
  });
});
describe("it queue urls", () => {
  it("ff", () => {});
});
