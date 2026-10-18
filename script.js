
"use strict";

// ========================================
// 1. GET HTML ELEMENTS
// ========================================

const expressionDisplay = document.getElementById("expression");
const resultDisplay = document.getElementById("result");
const angleButton = document.getElementById("angle-mode");
const historyList = document.getElementById("history-list");
const clearHistoryButton = document.getElementById("clear-history");
const buttons = document.querySelectorAll(".btn");

// ========================================
// 2. CALCULATOR STATE
// ========================================

let expression = "";
let lastAnswer = 0;
let angleMode = "DEG";
let justCalculated = false;
let calculationHistory = [];

const MAX_EXPRESSION_LENGTH = 200;

// ========================================
// 3. FORMAT NUMBERS
// ========================================

function formatNumber(number) {
    if (!Number.isFinite(number)) {
        throw new Error("Result is outside the supported range.");
    }

    if (Object.is(number, -0) || number === 0) {
        return "0";
    }

    return Number(number.toPrecision(12)).toString();
}

// ========================================
// 4. MECHANICAL BUTTON SOUNDS
// ========================================

let audioContext = null;

function playMechanicalClick(isEquals = false) {
    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        if (!audioContext) {
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(
            isEquals ? 1050 : 720,
            now
        );

        oscillator.frequency.exponentialRampToValueAtTime(
            isEquals ? 620 : 430,
            now + (isEquals ? 0.09 : 0.035)
        );

        gain.gain.setValueAtTime(isEquals ? 0.13 : 0.08, now);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            now + (isEquals ? 0.11 : 0.045)
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(now);
        oscillator.stop(now + (isEquals ? 0.12 : 0.05));
    } catch (error) {
        // The calculator should still work if audio is unavailable.
    }
}

// ========================================
// 5. SAFE MATHEMATICAL EXPRESSION PARSER
// ========================================

function calculate(input) {
    const tokenPattern =
        /\s*([0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?|\.[0-9]+|[a-zA-Z]+|[()+\-*/^%!])/gy;

    const tokens = [];
    let position = 0;

    while (position < input.length) {
        tokenPattern.lastIndex = position;
        const match = tokenPattern.exec(input);

        if (!match) {
            throw new Error("Invalid character in expression.");
        }

        tokens.push(match[1]);
        position = tokenPattern.lastIndex;
    }

    let index = 0;

    function peek() {
        return tokens[index];
    }

    function consume() {
        return tokens[index++];
    }

    function factorial(number) {
        if (
            !Number.isInteger(number) ||
            number < 0 ||
            number > 170
        ) {
            throw new Error("Factorial requires an integer from 0 to 170.");
        }

        let answer = 1;

        for (let i = 2; i <= number; i++) {
            answer *= i;
        }

        return answer;
    }

    function primary() {
        const token = consume();

        if (token === undefined) {
            throw new Error("Incomplete expression.");
        }

        if (token === "(") {
            const value = addSubtract();

            if (consume() !== ")") {
                throw new Error("Missing closing parenthesis.");
            }

            return value;
        }

        if (/^(?:\d|\.)/.test(token)) {
            const number = Number(token);

            if (!Number.isFinite(number)) {
                throw new Error("Invalid number.");
            }

            return number;
        }

        if (/^[a-zA-Z]+$/.test(token)) {
            const name = token.toLowerCase();

            if (name === "pi") return Math.PI;
            if (name === "e") return Math.E;
            if (name === "ans") return lastAnswer;

            const allowedFunctions = [
                "sin", "cos", "tan", "log", "ln", "sqrt"
            ];

            if (!allowedFunctions.includes(name)) {
                throw new Error("Unknown function or constant.");
            }

            if (consume() !== "(") {
                throw new Error("Use parentheses after a function.");
            }

            const value = addSubtract();

            if (consume() !== ")") {
                throw new Error("Missing closing parenthesis.");
            }

            switch (name) {
                case "sin":
                    return Math.sin(
                        angleMode === "DEG"
                            ? value * Math.PI / 180
                            : value
                    );

                case "cos":
                    return Math.cos(
                        angleMode === "DEG"
                            ? value * Math.PI / 180
                            : value
                    );

                case "tan": {
                    const radians = angleMode === "DEG"
                        ? value * Math.PI / 180
                        : value;

                    if (Math.abs(Math.cos(radians)) < 1e-12) {
                        throw new Error("Tangent is undefined here.");
                    }

                    return Math.tan(radians);
                }

                case "log":
                    if (value <= 0) {
                        throw new Error("log requires a positive number.");
                    }
                    return Math.log10(value);

                case "ln":
                    if (value <= 0) {
                        throw new Error("ln requires a positive number.");
                    }
                    return Math.log(value);

                case "sqrt":
                    if (value < 0) {
                        throw new Error("Square root requires a non-negative number.");
                    }
                    return Math.sqrt(value);
            }
        }

        throw new Error("Invalid expression.");
    }

    // Factorials and percentages can follow a value.
    function postfix() {
        let value = primary();

        while (peek() === "!" || peek() === "%") {
            const operator = consume();

            if (operator === "!") {
                value = factorial(value);
            } else {
                value = value / 100;
            }
        }

        return value;
    }

    // Powers are evaluated from right to left.
    function power() {
        const base = postfix();

        if (peek() === "^") {
            consume();
            const exponent = unary();
            return Math.pow(base, exponent);
        }

        return base;
    }

    function unary() {
        if (peek() === "+") {
            consume();
            return unary();
        }

        if (peek() === "-") {
            consume();
            return -unary();
        }

        return power();
    }

    function multiplyDivide() {
        let value = unary();

        while (peek() === "*" || peek() === "/") {
            const operator = consume();
            const right = unary();

            if (operator === "/" && right === 0) {
                throw new Error("Cannot divide by zero.");
            }

            value = operator === "*"
                ? value * right
                : value / right;
        }

        return value;
    }

    function addSubtract() {
        let value = multiplyDivide();

        while (peek() === "+" || peek() === "-") {
            const operator = consume();
            const right = multiplyDivide();

            value = operator === "+"
                ? value + right
                : value - right;
        }

        return value;
    }

    if (tokens.length === 0) {
        throw new Error("Enter a calculation first.");
    }

    const answer = addSubtract();

    if (index !== tokens.length) {
        throw new Error("Check your expression.");
    }

    if (!Number.isFinite(answer)) {
        throw new Error("Result is outside the supported range.");
    }

    return answer;
}

// ========================================
// 6. UPDATE THE DISPLAY
// ========================================

function updateDisplay() {
    expressionDisplay.textContent = expression;
}

// ========================================
// 7. ENTER A VALUE OR FUNCTION
// ========================================

function insertValue(value) {
    if (expression.length + value.length > MAX_EXPRESSION_LENGTH) {
        return;
    }

    if (justCalculated) {
        const continuesAnswer = ["+", "-", "*", "/", "^", "!", "%"].includes(value);

        if (continuesAnswer) {
            expression = formatNumber(lastAnswer);
        } else {
            expression = "";
        }

        justCalculated = false;
    }

    expression += value;
    updateDisplay();
}

// ========================================
// 8. CLEAR AND DELETE
// ========================================

function clearCalculator() {
    expression = "";
    justCalculated = false;
    expressionDisplay.textContent = "";
    resultDisplay.textContent = "0";
}

function deleteLastCharacter() {
    if (justCalculated) {
        expression = "";
        justCalculated = false;
    } else {
        expression = expression.slice(0, -1);
    }

    updateDisplay();
}

// ========================================
// 9. CALCULATE THE ANSWER
// ========================================

function calculateResult() {
    if (!expression.trim()) return;

    const expressionToCalculate = expression;

    try {
        const answer = calculate(expressionToCalculate);
        const formattedAnswer = formatNumber(answer);

        lastAnswer = answer;
        resultDisplay.textContent = formattedAnswer;

        addToHistory(expressionToCalculate, formattedAnswer);

        expression = formattedAnswer;
        expressionDisplay.textContent = expressionToCalculate + " =";
        justCalculated = true;
    } catch (error) {
        resultDisplay.textContent = "Error";
        expressionDisplay.textContent = error.message;
        justCalculated = false;
    }
}

// ========================================
// 10. CALCULATION HISTORY
// ========================================

function addToHistory(oldExpression, answer) {
    calculationHistory.unshift({
        expression: oldExpression,
        result: answer
    });

    // Keep the most recent 20 calculations.
    calculationHistory = calculationHistory.slice(0, 20);

    renderHistory();
}

function renderHistory() {
    historyList.replaceChildren();

    if (calculationHistory.length === 0) {
        const emptyItem = document.createElement("li");

        emptyItem.className = "empty-history";
        emptyItem.textContent =
            "Your calculations will appear here.";

        historyList.appendChild(emptyItem);
        return;
    }

    calculationHistory.forEach((item) => {
        const listItem = document.createElement("li");
        const oldExpression = document.createElement("div");
        const oldResult = document.createElement("div");
        const useAnswerButton = document.createElement("button");

        listItem.className = "history-item";
        oldExpression.className = "history-expression";
        oldResult.className = "history-result";

        oldExpression.textContent = item.expression + " =";
        oldResult.textContent = item.result;
        useAnswerButton.textContent = "Use answer";

        useAnswerButton.addEventListener("click", () => {
            lastAnswer = Number(item.result);
            expression = item.result;
            justCalculated = true;

            expressionDisplay.textContent = item.expression + " =";
            resultDisplay.textContent = item.result;

            playMechanicalClick();
        });

        listItem.append(
            oldExpression,
            oldResult,
            useAnswerButton
        );

        historyList.appendChild(listItem);
    });
}

function clearHistory() {
    calculationHistory = [];
    renderHistory();
}

// ========================================
// 11. HANDLE BUTTON CLICKS
// ========================================

buttons.forEach((button) => {
    button.addEventListener("click", () => {
        const value = button.dataset.value;
        const action = button.dataset.action;

        playMechanicalClick(action === "equals");

        if (action === "clear") {
            clearCalculator();
            return;
        }

        if (action === "delete") {
            deleteLastCharacter();
            return;
        }

        if (action === "equals") {
            calculateResult();
            return;
        }

        if (action === "toggle-angle") {
            angleMode = angleMode === "DEG" ? "RAD" : "DEG";
            angleButton.textContent = angleMode;
            return;
        }

        if (value !== undefined) {
            insertValue(value);
        }
    });
});

angleButton.addEventListener("click", () => {
    playMechanicalClick();
    angleMode = angleMode === "DEG" ? "RAD" : "DEG";
    angleButton.textContent = angleMode;
});

clearHistoryButton.addEventListener("click", () => {
    playMechanicalClick();
    clearHistory();
});

// ========================================
// 12. KEYBOARD SUPPORT
// ========================================

document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key;

    if (/^[0-9.]$/.test(key)) {
        insertValue(key);
        playMechanicalClick();
    } else if (["+", "-", "*", "/", "^", "(", ")", "%", "!"].includes(key)) {
        insertValue(key);
        playMechanicalClick();
    } else if (key === "Enter" || key === "=") {
        event.preventDefault();
        playMechanicalClick(true);
        calculateResult();
    } else if (key === "Backspace") {
        deleteLastCharacter();
        playMechanicalClick();
    } else if (key === "Escape") {
        clearCalculator();
        playMechanicalClick();
    }
});

// ========================================
// 13. INITIALIZE CALCULATOR
// ========================================

angleButton.textContent = angleMode;
renderHistory();
updateDisplay();


// ========================================
// 14. DRAWING WHITEBOARD
// ========================================

const drawingBoard = document.getElementById("drawing-board");
const drawingContext = drawingBoard.getContext("2d");

const penColorInput = document.getElementById("pen-color");
const penSizeInput = document.getElementById("pen-size");
const penToolButton = document.getElementById("pen-tool");
const eraserToolButton = document.getElementById("eraser-tool");
const clearBoardButton = document.getElementById("clear-board");

let isDrawing = false;
let currentTool = "pen";
let currentStroke = null;

// Each stroke stores normalized coordinates, so the drawing can
// be redrawn if the browser window changes size.
let boardStrokes = [];

function resizeDrawingBoard() {
    const rect = drawingBoard.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;

    if (!rect.width || !rect.height) return;

    drawingBoard.width = Math.round(rect.width * pixelRatio);
    drawingBoard.height = Math.round(rect.height * pixelRatio);

    drawingContext.setTransform(
        pixelRatio, 0, 0, pixelRatio, 0, 0
    );

    redrawBoard();
}

function redrawBoard() {
    const rect = drawingBoard.getBoundingClientRect();

    drawingContext.clearRect(0, 0, rect.width, rect.height);

    boardStrokes.forEach((stroke) => {
        if (stroke.points.length === 0) return;

        drawingContext.save();

        drawingContext.lineCap = "round";
        drawingContext.lineJoin = "round";
        drawingContext.lineWidth = stroke.size;

        if (stroke.tool === "eraser") {
            drawingContext.globalCompositeOperation =
                "destination-out";
        } else {
            drawingContext.globalCompositeOperation =
                "source-over";
            drawingContext.strokeStyle = stroke.color;
        }

        const firstPoint = stroke.points[0];

        const firstX = firstPoint.x * rect.width;
        const firstY = firstPoint.y * rect.height;

        drawingContext.beginPath();
        drawingContext.moveTo(firstX, firstY);

        if (stroke.points.length === 1) {
            // Draw a dot when the user simply clicks.
            drawingContext.lineTo(firstX + 0.01, firstY + 0.01);
        } else {
            stroke.points.slice(1).forEach((point) => {
                drawingContext.lineTo(
                    point.x * rect.width,
                    point.y * rect.height
                );
            });
        }

        drawingContext.stroke();
        drawingContext.restore();
    });
}

function getBoardPoint(event) {
    const rect = drawingBoard.getBoundingClientRect();

    return {
        x: Math.max(0, Math.min(1,
            (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1,
            (event.clientY - rect.top) / rect.height))
    };
}

function startDrawing(event) {
    if (event.button !== undefined && event.button !== 0) {
        return;
    }

    event.preventDefault();

    isDrawing = true;

    const point = getBoardPoint(event);

    currentStroke = {
        tool: currentTool,
        color: penColorInput.value,
        size: Number(penSizeInput.value),
        points: [point]
    };

    boardStrokes.push(currentStroke);

    drawingBoard.setPointerCapture(event.pointerId);

    redrawBoard();
}

function continueDrawing(event) {
    if (!isDrawing || !currentStroke) return;

    event.preventDefault();

    currentStroke.points.push(getBoardPoint(event));

    redrawBoard();
}

function stopDrawing() {
    isDrawing = false;
    currentStroke = null;
}

drawingBoard.addEventListener("pointerdown", startDrawing);
drawingBoard.addEventListener("pointermove", continueDrawing);
drawingBoard.addEventListener("pointerup", stopDrawing);
drawingBoard.addEventListener("pointercancel", stopDrawing);
drawingBoard.addEventListener("lostpointercapture", stopDrawing);

penToolButton.addEventListener("click", () => {
    currentTool = "pen";

    penToolButton.classList.add("active-tool");
    eraserToolButton.classList.remove("active-tool");
});

eraserToolButton.addEventListener("click", () => {
    currentTool = "eraser";

    eraserToolButton.classList.add("active-tool");
    penToolButton.classList.remove("active-tool");
});

clearBoardButton.addEventListener("click", () => {
    boardStrokes = [];
    currentStroke = null;
    isDrawing = false;

    redrawBoard();
});

const boardResizeObserver = new ResizeObserver(() => {
    resizeDrawingBoard();
});

boardResizeObserver.observe(drawingBoard);

resizeDrawingBoard();
