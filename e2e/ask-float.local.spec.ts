import { test, expect } from "./mock-pi-fixture";
import { openFirstSession } from "./open-session";

// 本机验证用：浮动提问卡的默认位置、折叠、拖动，以及时间线末尾留白。截图目录由 ASK_FLOAT_SHOTS 指定。
const SHOTS = process.env.ASK_FLOAT_SHOTS ?? "test-results";

function geometry() {
	const layer = document.querySelector(".session-v-ask--floating") as HTMLElement;
	const column = layer.parentElement as HTMLElement;
	const stage = column.querySelector(".session-v-timeline-stage") as HTMLElement;
	const log = column.querySelector('.message-timeline > [role="log"]') as HTMLElement;
	const l = layer.getBoundingClientRect();
	const c = column.getBoundingClientRect();
	return {
		column: c.height,
		stage: stage.getBoundingClientRect().height,
		layerTop: l.top - c.top,
		reserve: getComputedStyle(log, "::after").height,
		stored: localStorage.getItem("pideck:ask-float-offset:v1"),
	};
}

test("floating ask card", async ({ window }) => {
	test.setTimeout(180_000);
	await expect(window.locator("#boot-overlay")).toHaveCount(0, { timeout: 20_000 });
	const composer = await openFirstSession(window);
	await composer.click();
	await window.keyboard.type("ASK_BATCH 浮层");
	await window.keyboard.press("Enter");
	const layer = window.locator(".session-v-ask--floating");
	await expect(layer).toBeVisible({ timeout: 15_000 });
	await window.waitForTimeout(600);
	await window.screenshot({ path: `${SHOTS}/1-default.png` });

	const initial = await window.evaluate(geometry);
	console.log("GEO default", JSON.stringify(initial));
	// 时间线占满整列（浮层不再挤占高度），且贴底时给时间线末尾留出余量
	expect(Math.abs(initial.column - initial.stage)).toBeLessThan(4);
	expect(Number.parseFloat(initial.reserve)).toBeGreaterThan(100);

	await layer.getByRole("button", { name: "收起选项" }).click();
	await window.waitForTimeout(500);
	await window.screenshot({ path: `${SHOTS}/2-collapsed.png` });
	await layer.getByRole("button", { name: "展开选项" }).click();

	// boundingBox 与 Electron 缩放后的坐标系不一致：用 hover 定位起点，再按页面坐标相对位移拖动
	const grip = window.locator(".ask-float-grip");
	const start = await grip.evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	});
	await grip.hover();
	await window.mouse.down();
	await window.mouse.move(start.x - 200, start.y - 900, { steps: 8 });
	await window.mouse.up();
	await window.waitForTimeout(500);
	const dragged = await window.evaluate(geometry);
	console.log("GEO dragged", JSON.stringify(dragged));
	expect(dragged.layerTop).toBeGreaterThanOrEqual(11);
	expect(dragged.layerTop).toBeLessThan(20);
	expect(dragged.reserve).toBe("0px");
	expect(dragged.stored).not.toBeNull();
	await window.screenshot({ path: `${SHOTS}/3-dragged.png` });

	// 浮层里照样能答题并提交（含跳过）
	await layer.locator(".ask-inline-bar-option", { hasText: "React" }).click();
	await layer.getByRole("button", { name: "跳过此题" }).click();
	await layer.locator(".ask-batch-question-body input").fill("float-ok");
	await layer.locator(".ask-batch-question-body").getByRole("button", { name: "提交" }).click();
	await expect(window.locator(".message-timeline")).toContainText("float-ok", { timeout: 15_000 });
	await expect(layer).toHaveCount(0);
	const reserveAfter = await window.evaluate(() => getComputedStyle(document.querySelector('.message-timeline > [role="log"]') as HTMLElement, "::after").height);
	expect(reserveAfter).toBe("0px");
	await window.screenshot({ path: `${SHOTS}/4-answered.png` });
});
