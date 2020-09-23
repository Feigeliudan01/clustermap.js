import gene from "./gene.js"
import { updateConfig } from "../utils.js"

export default function locus() {
	/* Draw cluster loci
	 *
	 * config: ClusterMap configuration object
	 * x: x scale
	 * s: loci scales
	 * t: d3 transition
	 * groupScale: ordinal scale mapping genes to homology groups
	 * legendScale: ordinal scale mapping homology groups to colours
	*/

	const config = {
		transitionDuration: 500,
		scaleFactor: 15,
		spacing: 50,
		offsetFromZero: false,
		trackBar: {
			colour: "#111",
			stroke: 1,
		},
		gene: {
			shape: {
				bodyHeight: 12,
				tipHeight: 5,
				tipLength: 12,
				onClick: null,
			},
			label: {
				anchor: "start",
				fontSize: 10,
				rotation: 12,
				show: true,
				start: 0.5,
			},
		},
	}

	const scales = {
		x: d3.scaleLinear()
			.domain([0, 1000])
			.range([0, config.scaleFactor]),
		offset: null,
		locus: null,
		group: null,
		colour: null,
	}

	let container = null
	let update = () => {
		if (!container) return
		container.call(my)
	}

	let isDragging = false
	let t = d3.transition().duration(config.transitionDuration)

	function my(selection) {
		if (!config) return
		selection.each(function(data) {

			// Establish locus scale if one isn't passed down
			if (!scales.locus)
				scales.locus = d3.scaleOrdinal()
					.domain(data.loci.map(l => l.uid))
					.range([1, data.loci.slice(0, data.loci.length).map(l => l.start)])

			container = d3.select(this)

			let locusEnter = (enter) => {
				enter = enter.append("g")
					.attr("id", getId)
					.attr("class", "locus")
					.each(locus => {
						locus._start = locus.start
						locus._end = locus.end
						locus._cluster = data.uid
					})
				enter.append("line")
					.attr("class", "trackBar")
					.style("fill", "#111")

				let hover = enter.append("g")
					.attr("class", "hover")
					.attr("opacity", 0)
				enter.append("g")
					.attr("class", "genes")
				hover.append("rect")
					.attr("class", "hover")
					.attr("fill", "rgba(0, 0, 0, 0.4)")

				let leftDrag = d3.drag()
					.on("start", () => { isDragging = true })
					.on("drag", (d, i, n) => {
						// Find closest gene start, from start to _end
						let geneStarts = d.genes
							.filter(gene => gene.end <= d._end)
							.map(gene => gene.start)
						let starts = [d.start, ...geneStarts].map(value => scales.x(value))
						let position = getClosest(starts, d3.event.x)
						let value = starts[position]

						d3.select(n[i]).attr("x", value - 8)

						// Adjust the cluster offset scale, update _start of this locus
						let domain = scales.offset.domain()
						let index = domain.findIndex(el => el === d._cluster)
						let range = scales.offset.range()

						// Update cluster offset scale based on new locus borders
						// If offsetFromZero is true, offset is always relative to the previous offset.
						// Otherwise, it is additive, resizing to the current mouse position
						// Adds/subtracts distance from previous locus start to current mouse position
						if (config.offsetFromZero) {
							range[index] -= value - scales.x(d._start)
						} else {
							range[index] += value - scales.x(d._start)
						}
						scales.offset.range(range)
						d._start = getBasePair(value)

						// Resize the hover <rect>, hide any genes not within bounds
						hover.select("rect.hover")
							.attr("x", value)
							.attr("width", getRealLength)
						enter.selectAll("g.gene")
							.attr("display", g => (g.start >= d._start && g.end <= d._end + 1) ? "inline" : "none")
						d3.selectAll("path.geneLink")
							.attr("display", getLinkDisplay)
						d3.select(`#cinfo_${d._cluster}`)
							.attr("transform", `translate(${scales.locus(d.uid) + scales.x(d._start) - 10}, 0)`)
						enter.call(updateTrackBar)
					})
					.on("end", () => {
						isDragging = false
						hover.transition().attr("opacity", 0)
						update()
					})
				hover.append("rect")
					.attr("class", "leftHandle")
					.attr("x", -8)
					.call(leftDrag)

				let rightDrag = d3.drag()
					.on("start", () => { isDragging = true })
					.on("drag", (d, i, n) => {
						// Find closest visible gene end, from _start to end
						let ends = d.genes
							.filter(gene => gene.start >= d._start)
							.map(gene => gene.end)
						let range = ends.map(value => scales.x(value))
						let position = getClosest(range, d3.event.x)
						d._end = getBasePair(range[position])

						// Update rect width, hide genes out of bounds
						d3.select(n[i])
							.attr("x", scales.x(d._end))
						hover.select("rect.hover")
							.attr("width", getRealLength)
						enter.selectAll("g.gene")
							.attr("display", g => (g.start >= d._start && g.end <= d._end + 1) ? "inline" : "none")
						d3.selectAll("path.geneLink")
							.attr("display", getLinkDisplay)
						enter.call(updateTrackBar)
					})
					.on("end", () => {
						isDragging = false
						hover.transition().attr("opacity", 0)
						update()
					})
				hover.append("rect")
					.attr("class", "rightHandle")
					.call(rightDrag)
				hover.selectAll("rect.leftHandle, rect.rightHandle")
					.attr("width", 8)
					.attr("cursor", "pointer")
				enter
					.on("mouseenter", () => { if (!isDragging) hover.transition().attr("opacity", 1) })
					.on("mouseleave", () => { if (!isDragging) hover.transition().attr("opacity", 0) })
				return enter.call(updateLoci)
			}

			let locusUpdate = (update) => {
				return update.call(update => update.transition(t).call(updateLoci))
			}

			// Draw each locus group
			let loci = container.selectAll("g.locus")
				.data(data.loci, d => d.uid)
				.join(locusEnter, locusUpdate)

			let geneFn = gene()
				.config({
					shape: config.gene.shape,
					label: config.gene.label,
				})
				.scales(scales)
				.update(update)
				.transition(t)

			loci.selectAll("g.genes")
				.call(geneFn)
		})
	}

	function getId(gene) {
		return `locus_${gene.uid}`
	}

	function getGene(uid) {
		// Gets data attached to a given gene UID
		return d3.select(`#gene_${uid}`)
	}

	function getLinkDisplay(link) {
		let a = d3.select(`#gene_${link.query.uid}`).attr("display")
		let b = d3.select(`#gene_${link.target.uid}`).attr("display")
		return (a === "none" || b === "none") ? "none" : "inline"
	}

	function getBasePair(value) {
		// Converts scale coordinates back to base pair value
		return Math.round(value * 1000 / config.scaleFactor)
	}

	function getClosest(values, value) {
		// Finds closest element to value in an array of values using D3 bisect
		return Math.max(Math.min(d3.bisectLeft(values, value), values.length - 1), 0)
	}

	function getRealLength(d) {
		return scales.x(d._end) - scales.x(d._start)
	}

	function updateTrackBar(selection) {
		let midPoint = config.gene.shape.tipHeight + config.gene.shape.bodyHeight / 2
		selection.select("line.trackBar")
			.attr("x1", d => scales.x(d._start))
			.attr("x2", d => scales.x(d._end))
			.attr("y1", midPoint)
			.attr("y2", midPoint)
			.style("stroke", config.trackBar.colour)
			.style("stroke-width", config.trackBar.stroke)
	}

	function updateLoci(selection) {
		let botPoint = config.gene.shape.tipHeight * 2 + config.gene.shape.bodyHeight
		let translate = d => `translate(${scales.locus(d.uid)}, 0)`
		selection.call(updateTrackBar)
		selection.attr("transform", translate)
		selection.selectAll("rect.hover, rect.leftHandle, rect.rightHandle")
			.attr("y", -10)
			.attr("height", botPoint + 20)
		selection.select("rect.hover")
			.attr("width", getRealLength)
		selection.select("rect.rightHandle")
			.attr("x", d => scales.x(d._end))
	}

	// Getters/setters
	my.config = function(_) {
		if (!arguments.length) return config
		updateConfig(config, _)
		return my
	}
	my.scales = function(_) {
		if (!arguments.length) return scales
		updateConfig(scales, _)
		return my
	}
	my.transition = function(_) {
		if (!arguments.length) return t
		t = _
		return my
	}
	my.update = function(_) {
		if (!arguments.length) return update
		update = _
		return my
	}

	return my
}