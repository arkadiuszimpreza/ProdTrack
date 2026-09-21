// src/utils/materialUtils.ts
function parseMaterialDimensions(name) {
  const normName = name.toLowerCase();
  const profileMatch = normName.match(/profil.*?(\d+)\s*(?:x|×)\s*(\d+)\s*(?:x|×)\s*([\d,.]+)/);
  if (profileMatch) {
    let w = parseInt(profileMatch[1], 10);
    let h = parseInt(profileMatch[2], 10);
    if (h > w) {
      const t = w;
      w = h;
      h = t;
    }
    return {
      parsedType: "profil",
      dim1: w.toString().padStart(5, "0"),
      dim2: h.toString().padStart(5, "0"),
      thickness: parseFloat(profileMatch[3].replace(",", ".")) || 0,
      rawDim1: w.toString(),
      rawDim2: h.toString(),
      rawThickness: profileMatch[3]
    };
  }
  const pipeMatch2 = normName.match(/rura.*?fi\s*([\d,.]+)\s*(?:mm)?\s*(?:x|×)\s*([\d,.]+)/);
  if (pipeMatch2) {
    return {
      parsedType: "rura_mm",
      dim1: pipeMatch2[1].padStart(5, "0"),
      dim2: "",
      thickness: parseFloat(pipeMatch2[2].replace(",", ".")) || 0,
      rawDim1: "fi " + pipeMatch2[1],
      rawDim2: "",
      rawThickness: pipeMatch2[2]
    };
  }
  const pipeMatch1 = name.match(/rura.*?([\d,.]+(?:\s*")?)\s*(?:x|×)\s*([\d,.]+)/i);
  if (pipeMatch1) {
    const d1 = pipeMatch1[1].trim();
    const isInch = d1.includes('"');
    return {
      parsedType: isInch ? "rura_cale" : "rura_mm",
      dim1: d1.padStart(5, "0"),
      dim2: "",
      thickness: parseFloat(pipeMatch1[2].replace(",", ".")) || 0,
      rawDim1: d1,
      rawDim2: "",
      rawThickness: pipeMatch1[2]
    };
  }
  const katownikMatch = normName.match(/k.townik.*?(\d+)\s*(?:x|×)\s*(\d+)\s*(?:x|×)\s*([\d,.]+)/);
  if (katownikMatch) {
    let w = parseInt(katownikMatch[1], 10);
    let h = parseInt(katownikMatch[2], 10);
    if (h > w) {
      const t = w;
      w = h;
      h = t;
    }
    return {
      parsedType: "katownik",
      dim1: w.toString().padStart(5, "0"),
      dim2: h.toString().padStart(5, "0"),
      thickness: parseFloat(katownikMatch[3].replace(",", ".")) || 0,
      rawDim1: w.toString(),
      rawDim2: h.toString(),
      rawThickness: katownikMatch[3]
    };
  }
  const ceownikMatch = normName.match(/ceownik.*?(\d+)/);
  if (ceownikMatch) {
    return {
      parsedType: "ceownik",
      dim1: parseInt(ceownikMatch[1], 10).toString().padStart(5, "0"),
      dim2: "",
      thickness: 0,
      rawDim1: ceownikMatch[1],
      rawDim2: "",
      rawThickness: "-"
    };
  }
  const dwuteownikMatch = normName.match(/dwuteownik.*?(\d+)/);
  if (dwuteownikMatch) {
    return {
      parsedType: "dwuteownik",
      dim1: parseInt(dwuteownikMatch[1], 10).toString().padStart(5, "0"),
      dim2: "",
      thickness: 0,
      rawDim1: dwuteownikMatch[1],
      rawDim2: "",
      rawThickness: "-"
    };
  }
  const pretMatch = normName.match(/pr.t.*?fi\s*(\d+)/);
  if (pretMatch) {
    return {
      parsedType: "pret",
      dim1: parseInt(pretMatch[1], 10).toString().padStart(5, "0"),
      dim2: "",
      thickness: 0,
      rawDim1: pretMatch[1],
      rawDim2: "",
      rawThickness: "-"
    };
  }
  if (normName.includes("blacha") || normName.startsWith("bl ") || normName.startsWith("bl.")) {
    let mat = "zzz";
    const matMatch = normName.match(/\b(al|aluminiowa|cz|ko|nierdzewna|ocynk|ocynkowana|s355|s235|st|ryfl|ryflowana)\b/);
    if (matMatch) {
      const m = matMatch[1];
      if (m === "aluminiowa") mat = "al";
      else if (m === "nierdzewna") mat = "ko";
      else if (m === "ocynkowana") mat = "ocynk";
      else if (m === "ryflowana") mat = "ryfl";
      else mat = m;
    } else if (normName.match(/al\d/)) {
      mat = "al";
    } else if (normName.match(/cz\d/)) {
      mat = "cz";
    } else if (normName.match(/ko\d/)) {
      mat = "ko";
    }
    let thickness = 0;
    const numMatch = normName.match(/(?:^|\s)([0-9]+(?:[,.][0-9]+)?)(?:mm)?(?:$|\s)/);
    if (numMatch) {
      thickness = parseFloat(numMatch[1].replace(",", "."));
    } else {
      const attachedMatch = normName.match(/[a-z.]+([0-9]+(?:[,.][0-9]+)?)/);
      if (attachedMatch) {
        thickness = parseFloat(attachedMatch[1].replace(",", "."));
      }
    }
    return {
      parsedType: "blacha",
      dim1: mat,
      dim2: "",
      thickness,
      rawDim1: mat,
      rawDim2: "",
      rawThickness: thickness.toString()
    };
  }
  return {
    parsedType: "inne",
    dim1: "zzz",
    dim2: "zzz",
    thickness: 0,
    rawDim1: "-",
    rawDim2: "-",
    rawThickness: "-"
  };
}
function compareMaterialNames(nameA, nameB) {
  const parsedA = parseMaterialDimensions(nameA);
  const parsedB = parseMaterialDimensions(nameB);
  if (parsedA.parsedType !== parsedB.parsedType) {
    return parsedA.parsedType.localeCompare(parsedB.parsedType);
  }
  if (parsedA.dim1 !== parsedB.dim1) {
    return parsedA.dim1.localeCompare(parsedB.dim1);
  }
  if (parsedA.dim2 !== parsedB.dim2) {
    return parsedA.dim2.localeCompare(parsedB.dim2);
  }
  if (parsedA.thickness !== parsedB.thickness) {
    return parsedA.thickness - parsedB.thickness;
  }
  return nameA.localeCompare(nameB);
}

// test_sort.ts
var items = [
  "Ceownik CZ 120",
  "Ceownik CZ 50",
  "Ceownik CZ 65",
  "Ceownik CZ 200",
  "Ceownik CZ 100 gat S355J2 gw",
  "Ceownik CZ 80 gat S355J2",
  "Dwuteownik CZ IPE 220",
  "Dwuteownik CZ IPE 180",
  "K\u0105townik CZ 40x40x4 gat S355J2",
  "K\u0105townik CZ 50x50x4",
  "K\u0105townik CZ 120x80x8",
  "K\u0105townik CZ 60x60x6",
  "K\u0105townik CZ 30x30x4",
  "K\u0105townik CZ 200x100x10 gat S235",
  "Pr\u0119t okr\u0105g\u0142y CZ fi 08 \u017Cebrowany",
  "Pr\u0119t okr\u0105g\u0142y CZ fi 10 \u017Cebrowany",
  "Pr\u0119t okr\u0105g\u0142y CZ fi 16 \u017Cebrowany",
  "Pr\u0119t okr\u0105g\u0142y CZ fi 12 \u017Cebrowany",
  "Pr\u0119t okr\u0105g\u0142y CZ fi 20 gat S355J2"
];
items.sort(compareMaterialNames);
console.log(items.join("\n"));
