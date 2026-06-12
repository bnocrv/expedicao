(() => {
  "use strict";

  const source = window.EXPEDITION_DATA;
  if (!source || !Array.isArray(source.records)) {
    document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>Não foi possível carregar os dados da expedição.</p>";
    return;
  }

  const records = source.records.map((record, index) => ({
    ...record,
    id: index + 1,
    year: Number(record.date.slice(0, 4)),
    month: Number(record.date.slice(5, 7)),
    day: Number(record.date.slice(8, 10)),
  }));
  const years = [...new Set(records.map(record => record.year))].sort();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const shortMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const colors = { 2024: "#a7a7ac", 2025: "#4a4a4f", 2026: "#ed1c24" };
  const number = new Intl.NumberFormat("pt-BR");
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
  const latestRecord = records.reduce((latest, record) => record.date > latest.date ? record : latest, records[0]);
  const state = {
    month: latestRecord.month,
    destination: "all",
    years: new Set(years),
    fair: true,
    metric: "trips",
    calendarYear: latestRecord.year,
    calendarMonth: latestRecord.month,
  };

  const elements = {
    month: document.querySelector("#monthFilter"),
    destination: document.querySelector("#destinationFilter"),
    yearOptions: document.querySelector("#yearOptions"),
    fair: document.querySelector("#fairComparison"),
    notice: document.querySelector("#coverageNotice"),
    calendarTitle: document.querySelector("#calendarTitle"),
    calendarSummary: document.querySelector("#calendarSummary"),
    calendarGrid: document.querySelector("#calendarGrid"),
    calendarList: document.querySelector("#calendarList"),
    filterBar: document.querySelector(".filter-bar"),
    filterToggle: document.querySelector("#filterToggle"),
    activeFilters: document.querySelector("#activeFilters"),
  };

  function initFilters() {
    monthNames.forEach((month, index) => elements.month.add(new Option(month, index + 1)));
    elements.month.value = String(state.month);

    const destinations = [...new Set(records.flatMap(record => record.stops.map(stop => stop.destination)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    destinations.forEach(destination => elements.destination.add(new Option(destination, destination)));

    years.forEach(year => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${year}" checked><span>${year}</span>`;
      elements.yearOptions.append(label);
    });

    const latestDate = parseDate(latestRecord.date);
    const formatted = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(latestDate);
    const databaseVolumes = records.reduce((sum, record) => sum + record.volumes, 0);
    document.querySelector("#databaseTrips").textContent = `${number.format(records.length)} saídas`;
    document.querySelector("#databaseVolumes").textContent = `${number.format(databaseVolumes)} volumes`;
    document.querySelector("#lastUpdate").textContent = `Até ${formatted}`;
    document.querySelector("#footerUpdate").textContent = `Atualizado em ${formatted}`;
  }

  function parseDate(value) {
    return new Date(`${value}T00:00:00Z`);
  }

  function isTransitionPeriod(year, month) {
    return year === 2024 && [8, 9].includes(Number(month));
  }

  function unavailablePeriodReason(year, month) {
    if (month === "all") return null;
    const numericMonth = Number(month);
    if (isTransitionPeriod(year, numericMonth)) return "transition";
    if (year === 2024 && numericMonth < 4) return "before-base";
    if (year === latestRecord.year && numericMonth > latestRecord.month) return "future";
    return null;
  }

  function selectedRecords({ ignoreMonth = false, ignoreDestination = false } = {}) {
    return records.filter(record => {
      if (isTransitionPeriod(record.year, record.month)) return false;
      if (!state.years.has(record.year)) return false;
      if (!ignoreMonth && state.month !== "all" && record.month !== Number(state.month)) return false;
      if (!ignoreDestination && state.destination !== "all" && !record.stops.some(stop => stop.destination === state.destination)) return false;
      if (state.fair && state.month !== "all" && Number(state.month) === latestRecord.month && record.year < latestRecord.year && record.day > latestRecord.day) return false;
      return true;
    });
  }

  function destinationVolumes(filtered) {
    const totals = new Map();
    filtered.forEach(record => {
      record.stops.forEach(stop => {
        if (state.destination !== "all" && stop.destination !== state.destination) return;
        totals.set(stop.destination, (totals.get(stop.destination) || 0) + stop.volumes);
      });
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }

  function percentageChange(current, previous) {
    if (!previous) return null;
    return (current - previous) / previous * 100;
  }

  function variationMarkup(current, previous, label) {
    const change = percentageChange(current, previous);
    if (change === null) return `<span class="variation neutral">Ano-base</span>`;
    const direction = change > 0 ? "up" : change < 0 ? "down" : "neutral";
    const signal = change > 0 ? "+" : "";
    return `<span class="variation ${direction}">${signal}${change.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <small>vs. ${label}</small></span>`;
  }

  function updateYearSummary(filtered) {
    const selectedYears = [...state.years].sort();
    const summary = selectedYears.map(year => {
      const yearRecords = filtered.filter(record => record.year === year);
      const volumes = yearRecords.reduce((sum, record) => sum + record.volumes, 0);
      return {
        year,
        unavailable: unavailablePeriodReason(year, state.month),
        trips: yearRecords.length,
        volumes,
        average: yearRecords.length ? volumes / yearRecords.length : 0,
        destinations: new Set(yearRecords.flatMap(record => record.stops.map(stop => stop.destination))).size,
      };
    });
    const period = state.month === "all" ? "Ano inteiro" : monthNames[Number(state.month) - 1];
    document.querySelector("#yearComparisonTitle").textContent =
      state.month === "all"
        ? "Resultado de cada ano"
        : state.fair && Number(state.month) === latestRecord.month
          ? `${period} até o dia ${latestRecord.day}: ${selectedYears.join(", ").replace(/, ([^,]*)$/, " e $1")}`
          : `${period} de ${selectedYears.join(", ").replace(/, ([^,]*)$/, " e $1")}`;
    document.querySelector("#yearComparisonDescription").textContent =
      state.month === "all"
        ? "Totais disponíveis em cada ano, respeitando os períodos sem base."
        : state.fair && Number(state.month) === latestRecord.month
          ? `Todos os anos foram limitados ao dia ${latestRecord.day} para uma comparação justa.`
          : "Cada cartão mostra somente o mês e o ano indicados.";

    document.querySelector("#yearSummary").innerHTML = summary.map((item, index) => {
      const previous = summary[index - 1];
      if (item.unavailable) {
        const unavailableCopy = item.unavailable === "transition"
          ? {
              tag: "Transição",
              title: "Sem dados comparáveis",
              text: "Período em branco devido à transição na expedição.",
              footer: "Agosto e setembro de 2024 não entram nas análises.",
            }
          : item.unavailable === "future"
            ? {
                tag: "Ainda não disponível",
                title: "Mês ainda não registrado",
                text: `A base de ${latestRecord.year} vai até ${monthNames[latestRecord.month - 1].toLowerCase()}.`,
                footer: "Este período não é contabilizado como zero.",
              }
            : {
                tag: "Fora da base",
                title: "Sem registros disponíveis",
                text: "A base de 2024 começa em abril.",
                footer: "Este período não é contabilizado como zero.",
              };
        return `
          <article class="year-card unavailable-year">
            <header>
              <div>
                <span>${period}</span>
                <strong>${item.year}</strong>
              </div>
              <span class="coverage-tag transition">${unavailableCopy.tag}</span>
            </header>
            <div class="unavailable-message">
              <strong>${unavailableCopy.title}</strong>
              <p>${unavailableCopy.text}</p>
            </div>
            <div class="year-card-footer">
              <span>${unavailableCopy.footer}</span>
            </div>
          </article>`;
      }
      const incomplete = item.year === 2024 && state.month === "all"
        ? `<span class="coverage-tag transition">Transição ago/set</span>`
        : item.year === latestRecord.year && (state.month === "all" || Number(state.month) === latestRecord.month)
          ? `<span class="coverage-tag current">Até dia ${latestRecord.day}</span>`
          : "";
      return `
        <article class="year-card ${item.year === latestRecord.year ? "current-year" : ""}">
          <header>
            <div>
              <span>${period}</span>
              <strong>${item.year}</strong>
            </div>
            ${incomplete}
          </header>
          <div class="year-main-numbers">
            <div class="year-number cars-number">
              <span>CARROS EXPEDIDOS</span>
              <strong>${number.format(item.trips)}</strong>
              ${previous?.unavailable ? `<span class="variation neutral">Sem base comparável</span>` : variationMarkup(item.trips, previous?.trips, previous?.year)}
            </div>
            <div class="year-number volumes-number">
              <span>VOLUMES EXPEDIDOS</span>
              <strong>${number.format(item.volumes)}</strong>
              ${previous?.unavailable ? `<span class="variation neutral">Sem base comparável</span>` : variationMarkup(item.volumes, previous?.volumes, previous?.year)}
            </div>
          </div>
          <div class="year-card-footer">
            <span><strong>${item.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong> volumes por carro</span>
            <span><strong>${item.destinations}</strong> destinos</span>
          </div>
        </article>`;
    }).join("");
  }

  function getCanvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width: rect.width, height: rect.height };
  }

  function drawComparison(filtered) {
    const canvas = document.querySelector("#comparisonChart");
    const { context: ctx, width, height } = getCanvasContext(canvas);
    const data = [...state.years].sort().map(year => {
      const yearRecords = filtered.filter(record => record.year === year);
      return {
        year,
        unavailable: unavailablePeriodReason(year, state.month),
        value: unavailablePeriodReason(year, state.month)
          ? null
          : state.metric === "trips"
            ? yearRecords.length
            : yearRecords.reduce((sum, record) => sum + record.volumes, 0),
      };
    });
    const max = Math.max(...data.map(item => item.value).filter(value => value !== null), 1);
    const padding = { top: 22, right: 20, bottom: 40, left: 52 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const steps = 4;

    ctx.clearRect(0, 0, width, height);
    ctx.font = "10px Arial";
    ctx.textAlign = "right";
    ctx.fillStyle = "#8a928e";
    ctx.strokeStyle = "#e9ece9";
    ctx.lineWidth = 1;
    for (let step = 0; step <= steps; step++) {
      const value = max * (1 - step / steps);
      const y = padding.top + chartHeight * step / steps;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(compact(value), padding.left - 9, y + 3);
    }

    const slot = chartWidth / Math.max(data.length, 1);
    const barWidth = Math.min(76, slot * .46);
    data.forEach((item, index) => {
      const x = padding.left + slot * index + (slot - barWidth) / 2;
      if (item.value === null) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#8a928e";
        ctx.font = "700 10px Arial";
        ctx.fillText("SEM DADOS", x + barWidth / 2, padding.top + chartHeight / 2);
        ctx.fillStyle = "#68716c";
        ctx.font = "600 11px Arial";
        ctx.fillText(String(item.year), x + barWidth / 2, height - 14);
        return;
      }
      const barHeight = chartHeight * item.value / max;
      const y = padding.top + chartHeight - barHeight;
      roundRect(ctx, x, y, barWidth, barHeight, 3, colors[item.year] || "#ed1c24");
      ctx.textAlign = "center";
      ctx.fillStyle = "#17231d";
      ctx.font = "700 11px Arial";
      ctx.fillText(number.format(item.value), x + barWidth / 2, Math.max(y - 9, 12));
      ctx.fillStyle = "#68716c";
      ctx.font = "600 11px Arial";
      ctx.fillText(String(item.year), x + barWidth / 2, height - 14);
    });

    document.querySelector("#comparisonLegend").innerHTML = data.map(item =>
      item.value === null
        ? `<span class="legend-item"><i class="legend-dot unavailable-dot"></i>${item.year}: ${item.unavailable === "transition" ? "transição na expedição" : "sem dados disponíveis"}</span>`
        : `<span class="legend-item"><i class="legend-dot" style="background:${colors[item.year]}"></i>${item.year}: ${number.format(item.value)} ${state.metric === "trips" ? "carros" : "volumes"}</span>`
    ).join("");
  }

  function roundRect(ctx, x, y, width, height, radius, fill) {
    if (height <= 0) return;
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, safeRadius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function compact(value) {
    if (value >= 1000) return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    return number.format(Math.round(value));
  }

  function drawTrend() {
    const canvas = document.querySelector("#trendChart");
    const { context: ctx, width, height } = getCanvasContext(canvas);
    const selectedYears = [...state.years].sort();
    const series = selectedYears.map(year => ({
      year,
      values: Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;
        const outsideAvailableData =
          (year === latestRecord.year && month > latestRecord.month) ||
          (year === 2024 && (month < 4 || isTransitionPeriod(year, month)));
        if (outsideAvailableData) return null;
        return records.filter(record =>
          record.year === year &&
          record.month === month &&
          (state.destination === "all" || record.stops.some(stop => stop.destination === state.destination))
        ).length;
      }),
    }));
    const max = Math.max(...series.flatMap(item => item.values).filter(value => value !== null), 1);
    const padding = { top: 18, right: 17, bottom: 34, left: 37 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);
    ctx.font = "9px Arial";
    ctx.fillStyle = "#8a928e";
    ctx.strokeStyle = "#ebeeeb";
    ctx.lineWidth = 1;
    for (let step = 0; step <= 4; step++) {
      const y = padding.top + chartHeight * step / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }
    shortMonths.forEach((month, index) => {
      const x = padding.left + chartWidth * index / 11;
      ctx.textAlign = "center";
      ctx.fillText(month, x, height - 12);
    });

    series.forEach(item => {
      ctx.beginPath();
      let hasOpenLine = false;
      item.values.forEach((value, index) => {
        if (value === null) {
          hasOpenLine = false;
          return;
        }
        const x = padding.left + chartWidth * index / 11;
        const y = padding.top + chartHeight - chartHeight * value / max;
        if (!hasOpenLine) {
          ctx.moveTo(x, y);
          hasOpenLine = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = colors[item.year];
      ctx.lineWidth = item.year === latestRecord.year ? 3 : 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      item.values.forEach((value, index) => {
        if (value === null) return;
        const x = padding.left + chartWidth * index / 11;
        const y = padding.top + chartHeight - chartHeight * value / max;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = colors[item.year];
        ctx.fill();
      });
    });
    document.querySelector("#trendLegend").innerHTML = series.map(item => `<span class="legend-item"><i class="legend-dot" style="background:${colors[item.year]}"></i>${item.year}</span>`).join("");
  }

  function updateRanking(filtered) {
    const ranking = destinationVolumes(filtered).slice(0, 6);
    const max = ranking[0]?.[1] || 1;
    document.querySelector("#destinationRanking").innerHTML = ranking.length ? ranking.map(([destination, volumes]) => `
      <div class="ranking-row">
        <strong title="${escapeHtml(destination)}">${escapeHtml(destination)}</strong>
        <span>${number.format(volumes)} vol.</span>
        <div class="ranking-track"><div class="ranking-fill" style="width:${volumes / max * 100}%"></div></div>
      </div>`).join("") : `<p class="empty-row">Sem destinos no período.</p>`;
  }

  function destinationMatches(record) {
    return state.destination === "all" ||
      record.stops.some(stop => stop.destination === state.destination);
  }

  function monthData(year, month, dayLimit = null) {
    const items = records.filter(record =>
      record.year === year &&
      record.month === month &&
      (!dayLimit || record.day <= dayLimit) &&
      !isTransitionPeriod(record.year, record.month) &&
      destinationMatches(record)
    );
    return {
      trips: items.length,
      volumes: items.reduce((sum, item) => sum + item.volumes, 0),
      days: new Set(items.map(item => item.date)).size,
    };
  }

  function updateInsights() {
    const may = {
      2024: monthData(2024, 5),
      2025: monthData(2025, 5),
      2026: monthData(2026, 5),
    };
    const june = {
      2024: monthData(2024, 6, latestRecord.day),
      2025: monthData(2025, 6, latestRecord.day),
      2026: monthData(2026, 6, latestRecord.day),
    };
    const combined = Object.fromEntries([2024, 2025, 2026].map(year => [
      year,
      {
        trips: may[year].trips + june[year].trips,
        volumes: may[year].volumes + june[year].volumes,
        days: may[year].days + june[year].days,
      },
    ]));
    const change = (current, previous) =>
      previous ? (current - previous) / previous * 100 : 0;
    const formatChange = value =>
      `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
    const items = [
      {
        title: `Maio/2026: ${may[2026].trips} carros`,
        badge: `${formatChange(change(may[2026].trips, may[2025].trips))} vs. 2025`,
        text: `Maio teve ${may[2026].trips} saídas em 2026, contra ${may[2025].trips} em 2025 e ${may[2024].trips} em 2024. Crescimento de ${formatChange(change(may[2026].trips, may[2024].trips))} sobre 2024.`,
      },
      {
        title: `Junho/2026: ${june[2026].trips} carros até dia ${latestRecord.day}`,
        badge: `${formatChange(change(june[2026].trips, june[2025].trips))} vs. 2025`,
        text: `No mesmo intervalo, junho teve ${june[2025].trips} saídas em 2025 e ${june[2024].trips} em 2024. Frente a 2024, o avanço é de ${formatChange(change(june[2026].trips, june[2024].trips))}.`,
      },
      {
        title: `Maio + junho: ${combined[2026].trips} carros em 2026`,
        badge: `${combined[2025].trips} em 2025`,
        text: `O período soma ${combined[2026].trips} saídas em 2026, mais que o dobro das ${combined[2025].trips} de 2025 e muito acima das ${combined[2024].trips} de 2024.`,
      },
      {
        title: `${number.format(combined[2026].volumes)} volumes no período`,
        badge: `${formatChange(change(combined[2026].volumes, combined[2025].volumes))} vs. 2025`,
        text: `Maio e junho até o dia ${latestRecord.day} movimentaram ${number.format(combined[2025].volumes)} volumes em 2025 e ${number.format(combined[2024].volumes)} em 2024.`,
      },
    ];
    document.querySelector("#insightList").innerHTML = items.slice(0, 4).map(item => `
      <div class="insight">
        <div class="insight-top"><strong>${escapeHtml(item.title)}</strong><span class="insight-badge">${escapeHtml(item.badge)}</span></div>
        <p>${escapeHtml(item.text)}</p>
      </div>`).join("");
  }

  function calendarRecords() {
    return records.filter(record => {
      if (record.year !== state.calendarYear || record.month !== state.calendarMonth) return false;
      if (isTransitionPeriod(record.year, record.month)) return false;
      return destinationMatches(record);
    });
  }

  function renderCalendar() {
    const month = state.calendarMonth;
    const year = state.calendarYear;
    const transition = isTransitionPeriod(year, month);
    const monthRecords = calendarRecords();
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const previousMonthDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    const recordsByDay = new Map();
    monthRecords.forEach(record => {
      if (!recordsByDay.has(record.day)) recordsByDay.set(record.day, []);
      recordsByDay.get(record.day).push(record);
    });

    elements.calendarTitle.textContent = `${monthNames[month - 1]} ${year}`;
    const currentIndex = year * 12 + month;
    const firstIndex = 2024 * 12 + 4;
    const lastIndex = latestRecord.year * 12 + latestRecord.month;
    document.querySelector("#calendarPrev").disabled = currentIndex <= firstIndex;
    document.querySelector("#calendarNext").disabled = currentIndex >= lastIndex;
    const volumes = monthRecords.reduce((sum, record) => sum + record.volumes, 0);
    const activeDays = recordsByDay.size;
    elements.calendarSummary.innerHTML = transition
      ? `<span><strong>Período em branco:</strong> transição na expedição</span>`
      : `<span><strong>${number.format(monthRecords.length)}</strong> carregamentos</span>
         <span><strong>${number.format(volumes)}</strong> volumes</span>
         <span><strong>${number.format(activeDays)}</strong> dias com expedição</span>
         ${state.destination !== "all" ? `<span>Destino: <strong>${escapeHtml(state.destination)}</strong></span>` : ""}`;

    if (transition) {
      elements.calendarGrid.innerHTML = `<div class="calendar-empty">Agosto e setembro de 2024 estão em branco por motivo de transição na expedição.</div>`;
      elements.calendarList.innerHTML = `<div class="calendar-list-empty">Agosto e setembro de 2024 estão em branco por motivo de transição na expedição.</div>`;
      return;
    }

    const cells = [];
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    for (let index = 0; index < cellCount; index++) {
      const dayNumber = index - firstWeekday + 1;
      const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      const displayedDay = dayNumber < 1
        ? previousMonthDays + dayNumber
        : dayNumber > daysInMonth
          ? dayNumber - daysInMonth
          : dayNumber;
      const dayRecords = isCurrentMonth ? (recordsByDay.get(dayNumber) || []) : [];
      const isToday = year === latestRecord.year && month === latestRecord.month && dayNumber === latestRecord.day;
      cells.push(`
        <div class="calendar-day ${isCurrentMonth ? "" : "outside"} ${isToday ? "today" : ""}">
          <div class="calendar-day-number">
            <span>${displayedDay}</span>
            ${dayRecords.length ? `<em>${dayRecords.length} ${dayRecords.length === 1 ? "carro" : "carros"}</em>` : ""}
          </div>
          <div class="calendar-loads">
            ${dayRecords.map(record => `
              <div class="calendar-load" title="${escapeHtml(record.destination)} - ${number.format(record.volumes)} volumes">
                <strong>${escapeHtml(record.destination)}</strong>
                <span>${number.format(record.volumes)} volumes</span>
              </div>`).join("")}
          </div>
        </div>`);
    }
    elements.calendarGrid.innerHTML = cells.join("");

    const mobileDays = [...recordsByDay.entries()].sort((a, b) => a[0] - b[0]);
    elements.calendarList.innerHTML = mobileDays.length
      ? mobileDays.map(([day, dayRecords]) => {
          const date = new Date(Date.UTC(year, month - 1, day));
          const label = new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            timeZone: "UTC",
          }).format(date);
          return `
            <article class="calendar-list-day">
              <header class="calendar-list-date">
                <strong>${escapeHtml(label)}</strong>
                <span>${dayRecords.length} ${dayRecords.length === 1 ? "carro" : "carros"}</span>
              </header>
              <div class="calendar-list-loads">
                ${dayRecords.map(record => `
                  <div class="calendar-list-load">
                    <strong>${escapeHtml(record.destination)}</strong>
                    <span>${number.format(record.volumes)} volumes</span>
                  </div>`).join("")}
              </div>
            </article>`;
        }).join("")
      : `<div class="calendar-list-empty">Nenhum carregamento registrado neste mês.</div>`;
  }

  function updateActiveFilters() {
    const period = state.month === "all" ? "Ano inteiro" : monthNames[Number(state.month) - 1];
    const destination = state.destination === "all" ? "Todos os destinos" : state.destination;
    const selectedYears = [...state.years].sort().join(", ");
    elements.activeFilters.innerHTML = `
      <span class="filter-chip">${escapeHtml(period)}</span>
      <span class="filter-chip">${escapeHtml(destination)}</span>
      <span class="filter-chip">${escapeHtml(selectedYears)}</span>
      ${state.fair ? `<span class="filter-chip">Mesmo período</span>` : ""}`;
  }

  function updateCoverage() {
    const selectedMonth = state.month === "all" ? null : Number(state.month);
    const messages = [];
    if (state.years.has(2024)) messages.push("Agosto e setembro de 2024 estão em branco por motivo de transição na expedição e não entram nas análises.");
    if (state.years.has(latestRecord.year) && (!selectedMonth || selectedMonth >= latestRecord.month)) messages.push(`Os dados de ${latestRecord.year} vão até ${dateFormatter.format(parseDate(latestRecord.date))}.`);
    if (state.fair && selectedMonth === latestRecord.month) messages.push(`Comparação equivalente aplicada até o dia ${latestRecord.day}.`);
    elements.notice.textContent = messages.join(" ");
    elements.notice.classList.toggle("visible", messages.length > 0);
  }

  function updateTitles() {
    const period = state.month === "all" ? "Ano inteiro" : monthNames[Number(state.month) - 1];
    document.querySelector("#comparisonTitle").textContent =
      state.fair && Number(state.month) === latestRecord.month
        ? `${period} até o dia ${latestRecord.day} por ano`
        : `${period} por ano`;
    document.querySelector("#fairComparisonHint").textContent = state.month === latestRecord.month ? `Limita os anos ao dia ${latestRecord.day}` : "Disponível para o mês atual da base";
    elements.fair.disabled = state.month === "all" || Number(state.month) !== latestRecord.month;
    if (elements.fair.disabled && state.fair) {
      state.fair = false;
      elements.fair.checked = false;
    }
  }

  function render() {
    updateTitles();
    const filtered = selectedRecords();
    updateYearSummary(filtered);
    drawComparison(filtered);
    drawTrend();
    updateRanking(filtered);
    updateInsights();
    updateCoverage();
    updateActiveFilters();
    renderCalendar();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function moveCalendar(direction) {
    let month = state.calendarMonth + direction;
    let year = state.calendarYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    const targetIndex = year * 12 + month;
    const firstIndex = 2024 * 12 + 4;
    const lastIndex = latestRecord.year * 12 + latestRecord.month;
    if (targetIndex < firstIndex || targetIndex > lastIndex) return;
    state.calendarMonth = month;
    state.calendarYear = year;
    renderCalendar();
  }

  elements.month.addEventListener("change", event => {
    state.month = event.target.value === "all" ? "all" : Number(event.target.value);
    if (state.month !== "all") {
      state.calendarMonth = Number(state.month);
      state.calendarYear = latestRecord.year;
    }
    render();
  });
  elements.destination.addEventListener("change", event => { state.destination = event.target.value; render(); });
  elements.yearOptions.addEventListener("change", event => {
    const year = Number(event.target.value);
    event.target.checked ? state.years.add(year) : state.years.delete(year);
    if (!state.years.size) {
      event.target.checked = true;
      state.years.add(year);
    }
    render();
  });
  elements.fair.addEventListener("change", event => { state.fair = event.target.checked; render(); });
  elements.filterToggle.addEventListener("click", () => {
    const open = elements.filterBar.classList.toggle("open");
    elements.filterToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelector(".metric-toggle").addEventListener("click", event => {
    const button = event.target.closest("button[data-metric]");
    if (!button) return;
    state.metric = button.dataset.metric;
    document.querySelectorAll(".metric-toggle button").forEach(item => item.classList.toggle("active", item === button));
    drawComparison(selectedRecords());
  });
  document.querySelector("#resetFilters").addEventListener("click", () => {
    state.month = latestRecord.month;
    state.destination = "all";
    state.years = new Set(years);
    state.fair = true;
    state.calendarYear = latestRecord.year;
    state.calendarMonth = latestRecord.month;
    elements.month.value = String(state.month);
    elements.destination.value = "all";
    elements.fair.checked = true;
    elements.yearOptions.querySelectorAll("input").forEach(input => input.checked = true);
    render();
  });
  document.querySelector("#calendarPrev").addEventListener("click", () => moveCalendar(-1));
  document.querySelector("#calendarNext").addEventListener("click", () => moveCalendar(1));
  document.querySelector("#calendarToday").addEventListener("click", () => {
    state.calendarYear = latestRecord.year;
    state.calendarMonth = latestRecord.month;
    renderCalendar();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawComparison(selectedRecords());
      drawTrend();
    }, 120);
  });

  initFilters();
  render();
})();
