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
  const latestRecord = records.reduce((latest, record) => record.date > latest.date ? record : latest, records[0]);
  const state = {
    destination: "all",
    years: new Set(years),
    metric: "trips",
    calendarYear: latestRecord.year,
    calendarMonth: latestRecord.month,
  };
  const comparisonState = {
    a: { year: latestRecord.year, months: new Set([latestRecord.month]) },
    b: { year: years.length > 1 ? years[years.length - 2] : latestRecord.year, months: new Set([latestRecord.month]) },
  };

  const elements = {
    calendarTitle: document.querySelector("#calendarTitle"),
    calendarSummary: document.querySelector("#calendarSummary"),
    calendarGrid: document.querySelector("#calendarGrid"),
    calendarList: document.querySelector("#calendarList"),
    periodAYear: document.querySelector("#periodAYear"),
    periodBYear: document.querySelector("#periodBYear"),
    periodAMonths: document.querySelector("#periodAMonths"),
    periodBMonths: document.querySelector("#periodBMonths"),
    periodSummary: document.querySelector("#periodSummary"),
  };

  function initFilters() {
    [elements.periodAYear, elements.periodBYear].forEach(select => {
      years.forEach(year => select.add(new Option(year, year)));
    });
    elements.periodAYear.value = String(comparisonState.a.year);
    elements.periodBYear.value = String(comparisonState.b.year);
    [[elements.periodAMonths, "a"], [elements.periodBMonths, "b"]].forEach(([container, key]) => {
      container.innerHTML = shortMonths.map((month, index) => `
        <label><input type="checkbox" value="${index + 1}" ${comparisonState[key].months.has(index + 1) ? "checked" : ""}><span>${month}</span></label>`).join("");
      syncComparisonMonthAvailability(key);
    });

    const latestDate = parseDate(latestRecord.date);
    const formatted = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(latestDate);
    const analysisRecords = records.filter(record => !isTransitionPeriod(record.year, record.month));
    const analysisVolumes = analysisRecords.reduce((sum, record) => sum + record.volumes, 0);
    const analysisRecordCount = source.metadata.analysisRecordCount ?? analysisRecords.length;
    const analysisTotalVolumes = source.metadata.analysisTotalVolumes ?? analysisVolumes;
    const duplicateCount = source.metadata.audit?.duplicateRowsRemoved ?? 0;
    document.querySelector("#databaseTrips").textContent = `${number.format(analysisRecordCount)} saídas`;
    document.querySelector("#databaseVolumes").textContent = `${number.format(analysisTotalVolumes)} volumes`;
    document.querySelector("#databaseAudit").textContent =
      `${number.format(records.length)} linhas únicas importadas` +
      (duplicateCount ? ` • ${duplicateCount} duplicidade removida` : "");
    document.querySelector("#lastUpdate").textContent = `Até ${formatted}`;
    document.querySelector("#footerUpdate").textContent = `Atualizado em ${formatted}`;
  }

  function parseDate(value) {
    return new Date(`${value}T00:00:00Z`);
  }

  function isTransitionPeriod(year, month) {
    return year === 2024 && [8, 9].includes(Number(month));
  }

  function visibleStops(record) {
    return state.destination === "all"
      ? record.stops
      : record.stops.filter(stop => stop.destination === state.destination);
  }

  function visibleVolume(record) {
    return visibleStops(record).reduce((sum, stop) => sum + stop.volumes, 0);
  }

  function visibleDestination(record) {
    return visibleStops(record).map(stop => stop.destination).join(" + ");
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

  function updateYearSummary() {
    const summary = [comparisonPeriod("a"), comparisonPeriod("b")];
    document.querySelector("#yearComparisonTitle").textContent = `${periodLabel(summary[0])} × ${periodLabel(summary[1])}`;
    document.querySelector("#yearComparisonDescription").textContent = "Os cartões e o gráfico abaixo usam exatamente os dois períodos selecionados.";
    document.querySelector("#yearSummary").innerHTML = summary.map((item, index) => {
      const previous = summary[index - 1];
      const includesCurrentMonth = item.year === latestRecord.year && item.months.includes(latestRecord.month);
      const transition = item.year === 2024 && item.months.some(month => isTransitionPeriod(item.year, month));
      const tag = includesCurrentMonth
        ? `<span class="coverage-tag current">Até dia ${latestRecord.day}</span>`
        : transition
          ? `<span class="coverage-tag transition">Ago/set sem base</span>`
          : "";
      return `
        <article class="year-card ${item.key === "a" ? "current-year" : ""}">
          <header>
            <div>
              <span>${item.label}</span>
              <strong>${periodLabel(item)}</strong>
            </div>
            ${tag}
          </header>
          <div class="year-main-numbers">
            <div class="year-number cars-number">
              <span>CARROS EXPEDIDOS</span>
              <strong>${number.format(item.trips)}</strong>
              ${index === 0 ? `<span class="variation neutral">Período-base</span>` : variationMarkup(item.trips, previous.trips, "período A")}
            </div>
            <div class="year-number volumes-number">
              <span>VOLUMES EXPEDIDOS</span>
              <strong>${number.format(item.volumes)}</strong>
              ${index === 0 ? `<span class="variation neutral">Período-base</span>` : variationMarkup(item.volumes, previous.volumes, "período A")}
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

  function comparisonPeriod(key) {
    const period = comparisonState[key];
    const filtered = records.filter(record =>
      record.year === period.year &&
      period.months.has(record.month) &&
      !isTransitionPeriod(record.year, record.month) &&
      (state.destination === "all" || record.stops.some(stop => stop.destination === state.destination))
    );
    const volumes = filtered.reduce((sum, record) => sum + visibleVolume(record), 0);
    return {
      key,
      label: `Período ${key.toUpperCase()}`,
      year: period.year,
      months: [...period.months].sort((a, b) => a - b),
      records: filtered,
      trips: filtered.length,
      volumes,
      average: filtered.length ? volumes / filtered.length : 0,
      destinations: new Set(filtered.flatMap(record => visibleStops(record).map(stop => stop.destination))).size,
    };
  }

  function periodLabel(item) {
    const months = item.months.map(month => shortMonths[month - 1]).join(", ");
    return `${months}/${item.year}`;
  }

  function drawComparison() {
    const canvas = document.querySelector("#comparisonChart");
    const { context: ctx, width, height } = getCanvasContext(canvas);
    const periods = [comparisonPeriod("a"), comparisonPeriod("b")];
    const data = periods.map(item => ({ ...item, value: item[state.metric] }));
    const max = Math.max(...data.map(item => item.value), 1);
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
      const barHeight = chartHeight * item.value / max;
      const y = padding.top + chartHeight - barHeight;
      roundRect(ctx, x, y, barWidth, barHeight, 3, item.key === "a" ? "#ed1c24" : "#4a4a4f");
      ctx.textAlign = "center";
      ctx.fillStyle = "#17231d";
      ctx.font = "700 11px Arial";
      ctx.fillText(number.format(item.value), x + barWidth / 2, Math.max(y - 9, 12));
      ctx.fillStyle = "#68716c";
      ctx.font = "600 11px Arial";
      ctx.fillText(item.label, x + barWidth / 2, height - 14);
    });

    document.querySelector("#comparisonLegend").innerHTML = data.map(item =>
      `<span class="legend-item"><i class="legend-dot" style="background:${item.key === "a" ? "#ed1c24" : "#4a4a4f"}"></i>${item.label} · ${periodLabel(item)}: ${number.format(item.value)} ${state.metric === "trips" ? "carros" : "volumes"}</span>`
    ).join("");
    const tripChange = percentageChange(periods[1].trips, periods[0].trips);
    const volumeChange = percentageChange(periods[1].volumes, periods[0].volumes);
    const formatChange = value => value === null ? "sem base" : `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    elements.periodSummary.innerHTML = `<strong>${periodLabel(periods[0])}</strong> × <strong>${periodLabel(periods[1])}</strong> · Período B: ${formatChange(tripChange)} em carros e ${formatChange(volumeChange)} em volumes.`;
  }

  function renderComparison() {
    updateYearSummary();
    drawComparison();
    const combinedRecords = [...new Map(
      [comparisonPeriod("a"), comparisonPeriod("b")]
        .flatMap(period => period.records)
        .map(record => [record.id, record])
    ).values()];
    updateRanking(combinedRecords);
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
      volumes: items.reduce((sum, item) => sum + visibleVolume(item), 0),
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
        text: `Maio completo e junho até o dia ${latestRecord.day} movimentaram ${number.format(combined[2025].volumes)} volumes em 2025 e ${number.format(combined[2024].volumes)} em 2024.`,
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
    const volumes = monthRecords.reduce((sum, record) => sum + visibleVolume(record), 0);
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
              <div class="calendar-load" title="${escapeHtml(visibleDestination(record))} - ${number.format(visibleVolume(record))} volumes">
                <strong>${escapeHtml(visibleDestination(record))}</strong>
                <span>${number.format(visibleVolume(record))} volumes</span>
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
                    <strong>${escapeHtml(visibleDestination(record))}</strong>
                    <span>${number.format(visibleVolume(record))} volumes</span>
                  </div>`).join("")}
              </div>
            </article>`;
        }).join("")
      : `<div class="calendar-list-empty">Nenhum carregamento registrado neste mês.</div>`;
  }

  function render() {
    renderComparison();
    drawTrend();
    updateInsights();
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

  function isComparisonMonthAvailable(year, month) {
    if (year === 2024 && (month < 4 || isTransitionPeriod(year, month))) return false;
    if (year === latestRecord.year && month > latestRecord.month) return false;
    return records.some(record => record.year === year && record.month === month);
  }
  function syncComparisonMonthAvailability(key) {
    const period = comparisonState[key];
    const container = key === "a" ? elements.periodAMonths : elements.periodBMonths;
    const inputs = [...container.querySelectorAll("input")];
    inputs.forEach(input => {
      const month = Number(input.value);
      input.disabled = !isComparisonMonthAvailable(period.year, month);
      if (input.disabled) period.months.delete(month);
    });
    if (!period.months.size) {
      const fallback = inputs.filter(input => !input.disabled).at(-1);
      if (fallback) period.months.add(Number(fallback.value));
    }
    inputs.forEach(input => input.checked = period.months.has(Number(input.value)));
  }
  function updateComparisonMonths(key, event) {
    const month = Number(event.target.value);
    event.target.checked ? comparisonState[key].months.add(month) : comparisonState[key].months.delete(month);
    if (!comparisonState[key].months.size) {
      event.target.checked = true;
      comparisonState[key].months.add(month);
    }
    renderComparison();
  }
  elements.periodAYear.addEventListener("change", event => { comparisonState.a.year = Number(event.target.value); syncComparisonMonthAvailability("a"); renderComparison(); });
  elements.periodBYear.addEventListener("change", event => { comparisonState.b.year = Number(event.target.value); syncComparisonMonthAvailability("b"); renderComparison(); });
  elements.periodAMonths.addEventListener("change", event => updateComparisonMonths("a", event));
  elements.periodBMonths.addEventListener("change", event => updateComparisonMonths("b", event));
  document.querySelector(".metric-toggle").addEventListener("click", event => {
    const button = event.target.closest("button[data-metric]");
    if (!button) return;
    state.metric = button.dataset.metric;
    document.querySelectorAll(".metric-toggle button").forEach(item => item.classList.toggle("active", item === button));
    drawComparison();
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
      drawComparison();
      drawTrend();
    }, 120);
  });

  initFilters();
  render();
})();
