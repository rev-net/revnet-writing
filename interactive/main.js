import * as Plot from "@observablehq/plot";
const html = String.raw;

/**
 * TODO:
 * Traders should withdraw liquidity eventually (sale is simple. how for purchase?)
 * JSON-encode parameters. Download and upload settings. URL-encoded base64 as well.
 * Price floor per token destroyed chart.
 * "Intelligent" LPs.
 * Liquidity fee.
 */

class LiquidityPool {
  /**
   * Create a simplified constant product AMM liquidity pool (x*y==k).
   * @param {number} eth - The initial amount of ETH liquidity.
   * @param {number} revnetToken - The initial amount of Revnet Token liquidity.
   */
  constructor(eth, revnetToken, dayDeployed) {
    this.eth = eth;
    this.revnetToken = revnetToken;
    this.dayDeployed = dayDeployed;
  }

  /**
   * @param {number} amount - The amount of ETH liquidity to provide.
   */
  provideEth(amount) {
    this.eth += amount;
  }

  /**
   * @param {number} amount - The amount of Revnet Token liquidity to provide.
   */
  provideRevnetTokens(amount) {
    this.revnetToken += amount;
  }

  /**
   * @return {number} The price of 1 ETH in terms of Revnet tokens.
   */
  getMarginalPriceOfEth() {
    return this.revnetToken / this.eth;
  }

  /**
   * @return {number} The price of 1 Revnet token in terms of ETH.
   */
  getMarginalPriceOfRevnetToken() {
    return this.eth / this.revnetToken;
  }

  /**
   * Calculate the amount of ETH that would be returned for a given amount of Revnet tokens.
   * @param {number} revnetTokenAmount - The amount of Revnet tokens.
   * @return {number} The amount of ETH that would be returned.
   */
  getEthReturn(revnetTokenAmount) {
    const invariant = this.eth * this.revnetToken;
    const newRevnetTokenBalance = this.revnetToken + revnetTokenAmount;
    const newEthBalance = invariant / newRevnetTokenBalance;
    return this.eth - newEthBalance;
  }

  /**
   * Calculate the amount of Revnet tokens that would be returned for a given amount of ETH.
   * @param {number} ethAmount - The amount of ETH.
   * @return {number} The amount of Revnet tokens that would be returned.
   */
  getRevnetTokenReturn(ethAmount) {
    const invariant = this.eth * this.revnetToken;
    const newEthBalance = this.eth + ethAmount;
    const newRevnetTokenBalance = invariant / newEthBalance;
    return this.revnetToken - newRevnetTokenBalance;
  }

  /**
   * Spend Revnet tokens to buy ETH.
   * @param {number} revnetTokenAmount - The amount of Revnet tokens to spend.
   * @return {number} The amount of ETH bought.
   */
  buyEth(revnetTokenAmount) {
    const invariant = this.eth * this.revnetToken;
    const newRevnetTokenBalance = this.revnetToken + revnetTokenAmount;
    const newEthBalance = invariant / newRevnetTokenBalance;
    const ethAmount = this.eth - newEthBalance;
    this.revnetToken = newRevnetTokenBalance;
    this.eth = newEthBalance;
    return ethAmount;
  }
  /**
   * Spend ETH to buy Revnet tokens.
   * @param {number} ethAmount - The amount of ETH to spend.
   * @returns {number} The amount of Revnet tokens bought.
   */
  buyRevnetTokens(ethAmount) {
    const invariant = this.eth * this.revnetToken;
    const newEthBalance = this.eth + ethAmount;
    const newRevnetTokenBalance = invariant / newEthBalance;
    const revnetTokenAmount = this.revnetToken - newRevnetTokenBalance;
    this.eth = newEthBalance;
    this.revnetToken = newRevnetTokenBalance;
    return revnetTokenAmount;
  }
}

class Revnet {
  /**
   * Create a simplified representation of a Revnet.
   * @param {number} priceCeilingIncreasePercentage - The percentage by which token issuance is reduced at the price ceiling increase frequency. 0-1.
   * @param {number} priceCeilingIncreaseFrequencyInDays - The frequency of price ceiling increase in days. Positive integer greater than zero.
   * @param {number} priceFloorTaxIntensity - The percentage curve of the price floor tax. 0-1.
   * @param {number} premintAmount - The amount of tokens preminted to the boost. Must be >= 0.
   * @param {number} boostPercent - The percentage of tokens routed to the boost. 0-1.
   * @param {number} boostDurationInDays - The duration of the boost in days. Positive integer greater than zero.
   * @param {Date} startDate - The start date of the Revnet.
   */
  constructor(
    priceCeilingIncreasePercentage,
    priceCeilingIncreaseFrequencyInDays,
    priceFloorTaxIntensity,
    premintAmount,
    boostPercent,
    boostDurationInDays
  ) {
    this.priceCeilingIncreasePercentage = priceCeilingIncreasePercentage;
    this.priceCeilingIncreaseFrequencyInDays =
      priceCeilingIncreaseFrequencyInDays;
    this.priceFloorTaxIntensity = priceFloorTaxIntensity;
    this.premintAmount = premintAmount;
    this.boostPercent = boostPercent;
    this.boostDurationInDays = boostDurationInDays;
    this.tokensSentToBoost = premintAmount;
    this.tokenSupply = premintAmount;
    this.ethBalance = 0;
    this.day = 0; // Start at day 0
  }

  /**
   * Get the number of tokens created per ETH at the Revnet's current day.
   * @return {number} The number of tokens created per ETH.
   */
  getTokensCreatedPerEth() {
    return Math.pow(
      1 - this.priceCeilingIncreasePercentage,
      Math.floor(this.day / this.priceCeilingIncreaseFrequencyInDays)
    );
  }
  /**
   * Get the amount of ETH which can currently be reclaimed by destroying a given number of tokens.
   * @param {number} tokensBeingDestroyed - The number of tokens being destroyed.
   * @return {number} The amount of ETH which can be reclaimed.
   */
  getEthReclaimAmount(tokensBeingDestroyed) {
    const ratioBeingDestroyed = tokensBeingDestroyed / this.tokenSupply;
    const intensityTerm =
      ratioBeingDestroyed * this.priceFloorTaxIntensity +
      1 -
      this.priceFloorTaxIntensity;
    return this.ethBalance * ratioBeingDestroyed * intensityTerm;
  }

  /**
   * Create tokens at the current ceiling price by paying in ETH.
   * @param {number} ethAmount - The amount of ETH.
   * @return {number} The number of tokens returned to the payer.
   */
  createTokensAtCeiling(ethAmount) {
    const tokenAmount = ethAmount * this.getTokensCreatedPerEth();
    this.ethBalance += ethAmount;
    this.tokenSupply += tokenAmount;
    if (this.day < this.boostDurationInDays) {
      this.tokensSentToBoost += tokenAmount * this.boostPercent;
      return tokenAmount * (1 - this.boostPercent);
    } else {
      return tokenAmount;
    }
  }

  /**
   * Destroy tokens at the floor price and return the amount of ETH reclaimed.
   * @param {number} tokenAmount - The amount of tokens to destroy.
   * @return {number} The amount of ETH reclaimed.
   */
  destroyTokensAtFloor(tokenAmount) {
    const ethAmount = this.getEthReclaimAmount(tokenAmount);
    this.tokenSupply -= tokenAmount;
    this.ethBalance -= ethAmount;
    return ethAmount;
  }

  /**
   * Get the current token price ceiling.
   * @return {number} The token price ceiling.
   */
  getPriceCeiling() {
    return 1 / this.getTokensCreatedPerEth();
  }

  incrementDay() {
    this.day += 1;
  }
}

class Trader {
  recordPurchase(ethSpent, revnetTokensReceived, source, day) {
    this.purchase = { ethSpent, revnetTokensReceived, source, day };
  }

  recordSale(revnetTokensSpent, ethReceived, source, day) {
    this.sale = { revnetTokensSpent, ethReceived, source, day };
  }
}

/**
 * Function to purchase Revnet tokens, routing payments to the most cost-effective option.
 * @param {number} ethSpent - The amount of ETH spent to purchase tokens.
 * @param {object} r - The Revnet object.
 * @param {object} p - The LiquidityPool object.
 * @returns {number} - The number of tokens purchased.
 */
function purchaseRevnetTokens(ethSpent, r, p) {
  let source, revnetTokensReceived;
  if (
    r.day >= p.dayDeployed &&
    p.revnetToken > p.getRevnetTokenReturn(ethSpent) &&
    p.getRevnetTokenReturn(ethSpent) > r.getTokensCreatedPerEth() * ethSpent
  ) {
    revnetTokensReceived = p.buyRevnetTokens(ethSpent);
    if (r.day < r.boostDurationInDays) {
      const tokensToSend = revnetTokensReceived * r.boostPercent;
      r.tokensSentToBoost += tokensToSend;
      revnetTokensReceived -= tokensToSend;
    }
    source = "pool";
  } else {
    revnetTokensReceived = r.createTokensAtCeiling(ethSpent);
    source = "revnet";
  }
  return { revnetTokensReceived, source };
}

/**
 * Function to sell Revnet tokens, routing payments to the most cost-effective option.
 * @param {number} revnetTokensSpent - The amount of Revnet tokens spent to sell.
 * @param {object} r - The Revnet object.
 * @param {object} p - The LiquidityPool object.
 * @returns {number} - The amount of ETH received from selling tokens.
 */
function sellRevnetTokens(revnetTokensSpent, r, p) {
  let source,
    ethReceived = 0;
  if (
    r.day >= p.dayDeployed &&
    p.eth > p.getEthReturn(revnetTokensSpent) &&
    p.getEthReturn(revnetTokensSpent) > r.getEthReclaimAmount(revnetTokensSpent)
  ) {
    source = "pool";
    ethReceived = p.buyEth(revnetTokensSpent);
  } else if (r.getEthReclaimAmount(revnetTokensSpent) < r.ethBalance) {
    source = "revnet";
    ethReceived = r.destroyTokensAtFloor(revnetTokensSpent);
  }

  return { ethReceived, source };
}

function newLCG(seed) {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  let currentSeed = seed;

  return function () {
    currentSeed = (a * currentSeed + c) % m;
    return currentSeed / m;
  };
}

function poissonRandomNumber(lambda, rand) {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= rand();
  } while (p > L);

  return k - 1;
}

function normalRandomNumber(rand) {
  return Math.sqrt(-2.0 * Math.log(rand())) * Math.cos(2.0 * Math.PI * rand());
}

function logNormRandomNumber(mu, sigma, rand) {
  return Math.exp(sigma * normalRandomNumber(rand) + mu);
}

function simulate() {
  const priceCeilingIncreaseFrequencyInDays = Number(
    document.getElementById("priceCeilingIncreaseFrequencyInDays").value
  );
  const priceCeilingIncreasePercentage = Number(
    document.getElementById("priceCeilingIncreasePercentage").value
  );
  const priceFloorTaxIntensity = Number(
    document.getElementById("priceFloorTaxIntensity").value
  );
  const boostPercent = Number(document.getElementById("boostPercent").value);
  const boostDurationInDays = Number(
    document.getElementById("boostDurationInDays").value
  );
  const premintAmount = Number(document.getElementById("premintAmount").value);
  const dayDeployed = Number(document.getElementById("dayDeployed").value);
  const eth = Number(document.getElementById("eth").value);
  const revnetToken = Number(document.getElementById("revnetToken").value);
  const daysToCalculate = Number(
    document.getElementById("daysToCalculate").value
  );
  const randomnessSeed = Number(
    document.getElementById("randomnessSeed").value
  );
  const dailyPurchasesLambda = Number(
    document.getElementById("dailyPurchasesLambda").value
  );
  const purchaseAmountMean = Number(
    document.getElementById("purchaseAmountMean").value
  );
  const purchaseAmountDeviation = Number(
    document.getElementById("purchaseAmountDeviation").value
  );
  const revnetTokenLiquidityRatio = Number(
    document.getElementById("revnetTokenLiquidityRatio").value
  );
  const ethLiquidityRatio = Number(
    document.getElementById("ethLiquidityRatio").value
  );
  const saleProbability = Number(
    document.getElementById("saleProbability").value
  );
  const minimumDaysHeld = Number(
    document.getElementById("minimumDaysHeld").value
  );

  const poissonRand = newLCG(randomnessSeed + 2);
  const buyRand = newLCG(randomnessSeed);
  const sellRand = newLCG(randomnessSeed + 1);

  const r = new Revnet(
    priceCeilingIncreasePercentage,
    priceCeilingIncreaseFrequencyInDays,
    priceFloorTaxIntensity,
    premintAmount,
    boostPercent,
    boostDurationInDays
  );
  const p = new LiquidityPool(eth, revnetToken, dayDeployed);
  if (revnetToken) r.tokenSupply += revnetToken; // Add initial liquidity pool supply to outstanding token supply.
  const traders = [];
  const simulationResults = [];

  for (; r.day < daysToCalculate; r.incrementDay()) {
    // Make purchases
    const dailyPurchases = [];
    for (
      let i = 0;
      i < poissonRandomNumber(dailyPurchasesLambda, poissonRand);
      i++
    ) {
      const t = new Trader();
      const ethSpent = logNormRandomNumber(
        purchaseAmountMean,
        purchaseAmountDeviation,
        buyRand
      );
      const { revnetTokensReceived, source } = purchaseRevnetTokens(
        ethSpent,
        r,
        p
      );
      t.recordPurchase(ethSpent, revnetTokensReceived, source, r.day);
      if (r.day >= p.dayDeployed)
        p.provideRevnetTokens(revnetTokenLiquidityRatio * revnetTokensReceived);
      traders.push(t);
      dailyPurchases.push({ ethSpent, revnetTokensReceived, source });
    }

    // Make sales
    const dailySales = [];
    traders.forEach((t) => {
      if (t.sale) return;
      if (r.day < t.purchase.day + minimumDaysHeld) return;
      if (sellRand() < saleProbability) {
        const revnetTokensSpent =
          t.purchase.revnetTokensReceived * (1 - revnetTokenLiquidityRatio);
        const { ethReceived, source } = sellRevnetTokens(
          revnetTokensSpent,
          r,
          p
        );
        t.recordSale(revnetTokensSpent, ethReceived, source, r.day);
        if (r.day >= p.dayDeployed)
          p.provideEth(ethLiquidityRatio * ethReceived);
        dailySales.push({ revnetTokensSpent, ethReceived, source });
      }
    });

    // Record results
    simulationResults.push({
      day: r.day,
      ethBalance: r.ethBalance,
      tokenSupply: r.tokenSupply,
      priceCeiling: r.getPriceCeiling(),
      priceFloor:
        r.tokenSupply > 1
          ? r.getEthReclaimAmount(1)
          : r.getEthReclaimAmount(r.tokenSupply),
      tokensSentToBoost: r.tokensSentToBoost,
      poolEthBalance: p.eth,
      poolRevnetTokenBalance: p.revnetToken,
      poolRevnetTokenPrice: p.getMarginalPriceOfRevnetToken(),
      oneTokenReclaimAmount: r.getEthReclaimAmount(1),
      fiveTokenReclaimAmount: r.getEthReclaimAmount(5),
      tenTokenReclaimAmount: r.getEthReclaimAmount(10),
      dailyPurchases,
      dailySales,
    });
  }

  return [simulationResults, traders];
}

const solar = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
};

const helpBar = document.getElementById("help-bar");
const dashboard = document.getElementById("dashboard");
const chartStyles = {
  color: solar.base01,
  backgroundColor: solar.base3,
  fontSize: "16px",
  fontFamily: "'Times New Roman', Times, serif",
  overflow: "visible",
};
function main() {
  console.time("main");
  dashboard.innerHTML = "";

  console.time("simulate");

  const [simulationData, traders] = simulate();
  console.timeEnd("simulate");

  const tokenPricePlot = Plot.plot({
    title: "Revnet Token Price",
    style: chartStyles,
    marginLeft: 0,
    x: { label: "Day", insetLeft: 36 },
    y: { label: "ETH (Ξ)" },
    marks: [
      Plot.ruleY([0]),
      Plot.ruleX(
        simulationData,
        Plot.pointerX({
          x: "day",
          stroke: solar.base01,
        })
      ),
      Plot.gridY({
        strokeDasharray: "0.75,2",
        strokeOpacity: 1,
      }),
      Plot.axisY({
        tickSize: 0,
        dx: 38,
        dy: -6,
        lineAnchor: "bottom",
        tickFormat: (d, i, t) => (i === t.length - 1 ? `Ξ ${d}` : d),
      }),
      Plot.text(
        simulationData,
        Plot.pointerX({
          px: "day",
          dy: -17,
          dx: 90,
          frameAnchor: "top-left",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `AMM Price: ${d.poolRevnetTokenPrice.toFixed(2)} Ξ`,
              `Ceiling: ${d.priceCeiling.toFixed(2)} Ξ`,
              `Floor: ${d.priceFloor.toFixed(2)} Ξ`,
            ].join("    "),
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "poolRevnetTokenPrice",
        stroke: solar.blue,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "poolRevnetTokenPrice",
          dx: 3,
          text: () => "AMM Price",
          textAnchor: "start",
          fill: solar.blue,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "priceCeiling",
        stroke: solar.green,
        curve: "step-after",
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "priceCeiling",
          dx: 3,
          text: () => "Price Ceiling",
          textAnchor: "start",
          fill: solar.green,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "priceFloor",
        stroke: solar.red,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "priceFloor",
          dx: 3,
          text: () => "Price Floor",
          textAnchor: "start",
          fill: solar.red,
        })
      ),
    ],
  });
  tokenPricePlot.setAttribute(
    "data-help",
    "This chart shows the token's AMM price moving between the Revnet's price ceiling and price floor."
  );

  const revnetBalancesPlot = Plot.plot({
    title: "Revnet Balance and Token Supply",
    style: chartStyles,
    x: { label: "Day" },
    y: { label: "Amount", grid: true },
    marks: [
      Plot.text(
        simulationData,
        Plot.pointerX({
          px: "day",
          dy: -18,
          frameAnchor: "top-right",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `Total Token Supply: ${d.tokenSupply.toFixed(2)}`,
              `ETH in Revnet: ${d.ethBalance.toFixed(2)} Ξ`,
            ].join("     "),
        })
      ),
      Plot.ruleY([0]),
      Plot.ruleX(
        simulationData,
        Plot.pointerX({
          x: "day",
          stroke: solar.base01,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "tokenSupply",
        stroke: solar.red,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "tokenSupply",
          dx: 3,
          text: () => "Total Token Supply",
          textAnchor: "start",
          fill: solar.red,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "ethBalance",
        stroke: solar.blue,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "ethBalance",
          dx: 3,
          text: () => "ETH in Revnet",
          textAnchor: "start",
          fill: solar.blue,
        })
      ),
    ],
  });
  revnetBalancesPlot.setAttribute(
    "data-help",
    "The Revnet's current token supply and ETH balance over time."
  );

  const liquidityPoolPlot = Plot.plot({
    title: "Liquidity Pool Balances",
    style: chartStyles,
    x: { label: "Day" },
    y: { label: "Amount", grid: true },
    marks: [
      Plot.text(
        simulationData,
        Plot.pointerX({
          px: "day",
          dy: -18,
          frameAnchor: "top-right",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `Token Balance: ${d.poolRevnetTokenBalance.toFixed(2)}`,
              `ETH Balance: ${d.poolEthBalance.toFixed(2)} Ξ`,
            ].join("    "),
        })
      ),
      Plot.ruleY([0]),
      Plot.ruleX(
        simulationData,
        Plot.pointerX({
          x: "day",
          stroke: solar.base01,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "poolRevnetTokenBalance",
        stroke: solar.red,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "poolRevnetTokenBalance",
          dx: 3,
          text: () => "Token Balance",
          textAnchor: "start",
          fill: solar.red,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "poolEthBalance",
        stroke: solar.blue,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "poolEthBalance",
          dx: 3,
          text: () => "ETH Balance",
          textAnchor: "start",
          fill: solar.blue,
        })
      ),
    ],
  });
  liquidityPoolPlot.setAttribute(
    "data-help",
    "The liquidity pool's ETH and token balances over time."
  );

  const boostPlot = Plot.plot({
    title: "Cumulative Tokens Sent to Boost",
    style: chartStyles,
    x: { label: "Day" },
    y: { label: "Tokens", grid: true },
    marks: [
      Plot.text(
        simulationData,
        Plot.pointerX({
          px: "day",
          dy: -18,
          frameAnchor: "top-right",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `Tokens sent: ${d.tokensSentToBoost.toFixed(2)}`,
            ].join("    "),
        })
      ),
      Plot.ruleY([0]),
      Plot.ruleX(
        simulationData,
        Plot.pointerX({
          x: "day",
          stroke: solar.base01,
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "tokensSentToBoost",
        stroke: solar.red,
      }),
    ],
  });
  boostPlot.setAttribute(
    "data-help",
    "The cumulative number of tokens sent to the boost address, including the premint."
  );

  const purchases = simulationData.flatMap((v) =>
    v.dailyPurchases.map((p) => {
      return { day: v.day, ...p };
    })
  );

  const sales = simulationData.flatMap((v) =>
    v.dailySales.map((s) => {
      return { day: v.day, ...s };
    })
  );

  const cumulativeTrades = [];
  const purchasesCopy = purchases.slice();
  const salesCopy = sales.slice();
  for (let i = 0; i < simulationData.length; i++) {
    let { ethSpent, revnetTokensReceived, revnetTokensSpent, ethReceived } =
      i === 0
        ? {
            ethSpent: 0,
            revnetTokensReceived: 0,
            revnetTokensSpent: 0,
            ethReceived: 0,
          }
        : cumulativeTrades[i - 1];

    while (purchasesCopy[0]?.day === i) {
      const purchaseToAdd = purchasesCopy.shift();
      ethSpent += purchaseToAdd.ethSpent;
      revnetTokensReceived += purchaseToAdd.revnetTokensReceived;
    }

    while (salesCopy[0]?.day === i) {
      const saleToAdd = salesCopy.shift();
      revnetTokensSpent += saleToAdd.revnetTokensSpent;
      ethReceived += saleToAdd.ethReceived;
    }

    cumulativeTrades.push({
      day: i,
      ethSpent,
      revnetTokensReceived,
      revnetTokensSpent,
      ethReceived,
    });
  }

  const cumulativeVolumesPlot = Plot.plot({
    title: "Cumulative Volumes (Revnet and Pool)",
    style: chartStyles,
    x: { label: "Day" },
    y: { label: "Amount", grid: true },
    marks: [
      Plot.text(
        cumulativeTrades,
        Plot.pointerX({
          px: "day",
          dy: -18,
          dx: 45,
          frameAnchor: "top-left",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `ETH Spent: ${d.ethSpent.toFixed(2)} Ξ`,
              `Tokens Received: ${d.revnetTokensReceived.toFixed(2)}`,
              `Tokens Spent: ${d.revnetTokensSpent.toFixed(2)}`,
              `ETH Recieved: ${d.ethReceived.toFixed(2)} Ξ`,
            ].join("   "),
        })
      ),
      Plot.ruleY([0]),
      Plot.ruleX(
        cumulativeTrades,
        Plot.pointerX({
          x: "day",
          stroke: solar.base01,
        })
      ),
      Plot.line(cumulativeTrades, {
        x: "day",
        y: "ethSpent",
        stroke: solar.blue,
      }),
      Plot.text(
        cumulativeTrades,
        Plot.selectLast({
          x: "day",
          y: "ethSpent",
          dx: 3,
          text: () => "ETH Spent",
          textAnchor: "start",
          fill: solar.blue,
        })
      ),
      Plot.line(cumulativeTrades, {
        x: "day",
        y: "revnetTokensReceived",
        stroke: solar.red,
      }),
      Plot.text(
        cumulativeTrades,
        Plot.selectLast({
          x: "day",
          y: "revnetTokensReceived",
          dx: 3,
          text: () => "Tokens Purchased",
          textAnchor: "start",
          fill: solar.red,
        })
      ),
      Plot.line(cumulativeTrades, {
        x: "day",
        y: "revnetTokensSpent",
        stroke: solar.green,
      }),
      Plot.text(
        cumulativeTrades,
        Plot.selectLast({
          x: "day",
          y: "revnetTokensSpent",
          dx: 3,
          text: () => "Tokens Sold",
          textAnchor: "start",
          fill: solar.green,
        })
      ),
      Plot.line(cumulativeTrades, {
        x: "day",
        y: "ethReceived",
        stroke: solar.cyan,
      }),
      Plot.text(
        cumulativeTrades,
        Plot.selectLast({
          x: "day",
          y: "ethReceived",
          dx: 3,
          text: () => "ETH Received From Sales",
          textAnchor: "start",
          fill: solar.cyan,
        })
      ),
    ],
  });
  cumulativeVolumesPlot.setAttribute(
    "data-help",
    "Totals for ETH/token spending and receiving across the Revnet and the liquidity pool."
  );

  const tokenReclaimAmountPlot = Plot.plot({
    title: "Price Floor Reclaim Values",
    style: chartStyles,
    x: { label: "Day" },
    y: { label: "ETH (Ξ)", grid: true },
    marks: [
      Plot.ruleY([0]),
      Plot.ruleX(
        simulationData,
        Plot.pointerX({ x: "day", stroke: solar.base01 })
      ),
      Plot.text(
        simulationData,
        Plot.pointerX({
          px: "day",
          dy: -18,
          frameAnchor: "top-right",
          text: (d) =>
            [
              `Day: ${d.day}`,
              `1 Token -> ${d.oneTokenReclaimAmount.toFixed(2)}Ξ`,
              `5 Tokens -> ${d.fiveTokenReclaimAmount.toFixed(2)}Ξ`,
              `10 Tokens -> ${d.tenTokenReclaimAmount.toFixed(2)}Ξ`,
            ].join("    "),
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "oneTokenReclaimAmount",
        stroke: solar.green,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "oneTokenReclaimAmount",
          fill: solar.green,
          dx: 3,
          textAnchor: "start",
          text: () => "1 Token",
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "fiveTokenReclaimAmount",
        stroke: solar.violet,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "fiveTokenReclaimAmount",
          fill: solar.violet,
          dx: 3,
          textAnchor: "start",
          text: () => "5 Tokens",
        })
      ),
      Plot.line(simulationData, {
        x: "day",
        y: "tenTokenReclaimAmount",
        stroke: solar.cyan,
      }),
      Plot.text(
        simulationData,
        Plot.selectLast({
          x: "day",
          y: "tenTokenReclaimAmount",
          fill: solar.cyan,
          dx: 3,
          textAnchor: "start",
          text: () => "10 Tokens",
        })
      ),
    ],
  });
  tokenReclaimAmountPlot.setAttribute(
    "data-help",
    "The amount of ETH which can be reclaimed from the Revnet by destroying 1, 5, or 10 tokens at the price floor over time."
  );

  const purchaseData = traders.filter((t) => t.purchase).map((t) => t.purchase);

  const purchasePlot = Plot.plot({
    title: "Purchases",
    style: chartStyles,
    grid: true,
    x: { label: "Day" },
    y: { label: "ETH Spent" },
    symbol: {
      label: "Source",
      legend: true,
      style: { background: "none", fontSize: "18px" },
    },
    color: { label: "Source", range: [solar.cyan, solar.magenta] },
    marks: [
      Plot.ruleY([0]),
      Plot.dot(purchaseData, {
        x: "day",
        y: "ethSpent",
        symbol: "source",
        stroke: "source",
        tip: true,
      }),
    ],
  });
  purchasePlot.setAttribute(
    "data-help",
    "Purchase amounts over time. Crosses were fulfilled by the Revnet, and circles were fulfilled by the liquidity pool."
  );

  const saleData = traders
    .filter((t) => t.sale)
    .map((t) => ({
      saleDay: t.sale.day,
      saleSource: t.sale.source,
      purchaseDay: t.purchase.day,
      purchaseSource: t.purchase.source,
      ethReceived: t.sale.ethReceived,
      daysHeld: t.sale.day - t.purchase.day,
      profit: t.sale.ethReceived - t.purchase.ethSpent,
      tokensPurchased: t.purchase.revnetTokensReceived,
    }));

  let avgReturn = 0,
    avgDaysHeld = 0,
    avgSaleSize = 0,
    salesThroughRevnet = 0,
    saleCount = 0,
    purchasesThroughRevnet = 0,
    avgPurchaseSize = 0,
    purchaseCount = 0;
  for (let trader of traders) {
    if (trader.purchase) {
      if (trader.purchase.source === "revnet") purchasesThroughRevnet++;
      avgPurchaseSize += trader.purchase.ethSpent;
      purchaseCount++;
    }

    if (trader.sale) {
      saleCount++;
      avgReturn += trader.sale.ethReceived - trader.purchase.ethSpent;
      avgDaysHeld += trader.sale.day - trader.purchase.day;
      avgSaleSize += trader.sale.ethReceived;
      if (trader.sale.source === "revnet") salesThroughRevnet++;
    }
  }
  avgPurchaseSize /= purchaseCount;

  avgReturn /= saleCount;
  avgDaysHeld /= saleCount;
  avgSaleSize /= saleCount;

  const salePlot = Plot.plot({
    title: "Sales",
    style: chartStyles,
    grid: true,
    x: { label: "Day" },
    y: { label: "ETH Received" },
    symbol: {
      label: "Source",
      legend: true,
      style: { background: "none", fontSize: "18px" },
    },
    color: { label: "Source", range: [solar.cyan, solar.magenta] },
    marks: [
      Plot.ruleY([0]),
      Plot.dot(saleData, {
        x: "saleDay",
        y: "ethReceived",
        symbol: "saleSource",
        stroke: "saleSource",
        tip: true,
      }),
    ],
  });
  salePlot.setAttribute(
    "data-help",
    "Sale amounts over time. Crosses were fulfilled by the Revnet, and circles were fulfilled by the liquidity pool."
  );

  const profitabilityPlot = Plot.plot({
    title: "Days Held vs. Return",
    style: chartStyles,
    grid: true,
    color: {
      scheme: "Warm",
      legend: true,
      label: "Day of Initial Purchase",
      style: { background: "none", fontSize: "12px" },
    },
    r: { label: "Tokens Purchased" },
    x: { label: "Days Held" },
    y: { label: "Return (Ξ)" },
    marks: [
      Plot.dot(saleData, {
        x: "daysHeld",
        y: "profit",
        r: "tokensPurchased",
        fill: "purchaseDay",
        tip: true,
      }),
    ],
  });
  profitabilityPlot.setAttribute(
    "data-help",
    "The x axis reflects the number of days a trader held their tokens, and the y axis reflects their return from selling. Larger dots represent greater token balances. Colors correpond to the initial purchase date."
  );

  dashboard.innerHTML += html`<table>
    <tr>
      <th>Category</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>Average Return</td>
      <td>${avgReturn > 0 ? "+" : ""}${avgReturn.toFixed(2)}Ξ</td>
    </tr>
    <tr>
      <td>Purchase Count</td>
      <td>${purchaseCount}</td>
    </tr>
    <tr>
      <td>Purchases via Revnet</td>
      <td>
        ${purchasesThroughRevnet}
        (${((100 * purchasesThroughRevnet) / purchaseCount).toFixed(2)}%)
      </td>
    </tr>
    <tr>
      <td>Average Purchase Size</td>
      <td>${avgPurchaseSize.toFixed(2)}Ξ</td>
    </tr>
    <tr>
      <td>Sale Count</td>
      <td>${saleCount}</td>
    </tr>
    <tr>
      <td>Sales via Revnet</td>
      <td>
        ${salesThroughRevnet}
        (${((100 * salesThroughRevnet) / saleCount).toFixed(2)}%)
      </td>
    </tr>
    <tr>
      <td>Average Sale Size</td>
      <td>${avgSaleSize.toFixed(2)}Ξ</td>
    </tr>
    <tr>
      <td>Average Days Held</td>
      <td>${avgDaysHeld.toFixed(2)}</td>
    </tr>
  </table>`;

  [
    tokenPricePlot,
    profitabilityPlot,
    revnetBalancesPlot,
    liquidityPoolPlot,
    cumulativeVolumesPlot,
    tokenReclaimAmountPlot,
    purchasePlot,
    salePlot,
    boostPlot,
  ].forEach((p) => {
    dashboard.appendChild(p);

    p.addEventListener("mouseenter", function (event) {
      helpBar.textContent = event.target.getAttribute("data-help");
      helpBar.style.display = "block";
    });
    p.addEventListener("mouseleave", function () {
      helpBar.style.display = "none";
    });
  });

  console.timeEnd("main");
}

main();

document
  .querySelectorAll("input")
  .forEach((i) => i.addEventListener("input", main));
