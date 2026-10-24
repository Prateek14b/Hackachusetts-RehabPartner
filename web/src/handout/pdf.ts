// Printable care plan handout: each exercise with its stick figure at the PT's target, plus a QR code
// the patient scans to open the plan in their account.
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { joinUrl, type CarePlan, type PlanExercise } from '../api'
import TargetFigure from '../components/TargetFigure'
import { EXERCISES } from '../exercises/library'

const PAGE = { width: 612, height: 792, margin: 48 } // US Letter, in points
const FIGURE = { width: 132, height: 120 } // keeps the stick figure's 220:200 aspect ratio
const SIDE_LABEL = { left: 'Left side', right: 'Right side', both: 'Both sides' }

// "1952-03-14" → "Mar 14, 1952", without timezone shifts
function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Render an SVG string to a PNG data URL (jsPDF can't draw SVG directly)
function svgToPng(svg: string, width: number, height: number, scale = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't draw an exercise figure for the PDF."))
    }
    img.src = url
  })
}

function figurePng(ex: PlanExercise): Promise<string> | null {
  const exercise = EXERCISES.find((m) => m.id === ex.exercise_id)
  if (!exercise || ex.target_rom == null) return null
  const svg = renderToStaticMarkup(createElement(TargetFigure, { exercise, target: ex.target_rom }))
  return svgToPng(svg, FIGURE.width, FIGURE.height)
}

export async function buildHandoutPdf(plan: CarePlan, joinToken: string): Promise<jsPDF> {
  const link = joinUrl(joinToken)
  const [qr, figures] = await Promise.all([
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 600 }),
    Promise.all(plan.exercises.map(figurePng)),
  ])

  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const { margin } = PAGE
  const textWidth = PAGE.width - margin * 2

  // Header + QR code
  const qrSize = 132
  const qrX = PAGE.width - margin - qrSize
  doc.addImage(qr, 'PNG', qrX, margin, qrSize, qrSize, undefined, 'FAST')
  doc.setFontSize(9).setTextColor(71, 85, 105)
  doc.text('Scan to open your plan', qrX + qrSize / 2, margin + qrSize + 12, { align: 'center' })

  doc.setTextColor(15, 23, 42).setFont('helvetica', 'bold').setFontSize(22)
  doc.text('Your home exercise plan', margin, margin + 18)
  doc.setFont('helvetica', 'normal').setFontSize(12)
  const details = [
    `Patient: ${plan.assigned_name}`,
    `Date of birth: ${formatDate(plan.assigned_dob)}`,
    `Prescribed by: ${plan.provider_name}`,
    `Date: ${formatDate(plan.created_at)}`,
  ]
  if (plan.therapy_type) details.push(`Therapy: ${plan.therapy_type[0].toUpperCase()}${plan.therapy_type.slice(1)}`)
  details.forEach((line, i) => doc.text(line, margin, margin + 46 + i * 17))

  doc.setFontSize(10).setTextColor(71, 85, 105)
  const howTo = doc.splitTextToSize(
    'Scan the QR code with your phone, then log in or create your Rehab.io patient account using the same ' +
      'name, date of birth and email your clinic has. Your plan will appear in your account.',
    qrX - margin - 16,
  )
  doc.text(howTo, margin, margin + 46 + details.length * 17 + 8)

  // Exercises
  let y = margin + 200
  doc.setDrawColor(203, 213, 225).line(margin, y - 16, PAGE.width - margin, y - 16)
  plan.exercises.forEach((ex, i) => {
    const figure = figures[i]
    const blockHeight = figure ? FIGURE.height + 16 : 48 // custom exercises have no figure
    if (y + blockHeight > PAGE.height - margin - 30) {
      doc.addPage()
      y = margin
    }
    const textX = figure ? margin + FIGURE.width + 20 : margin
    if (figure) {
      doc.addImage(figure, 'PNG', margin, y, FIGURE.width, FIGURE.height, undefined, 'FAST')
      doc.setDrawColor(226, 232, 240).roundedRect(margin, y, FIGURE.width, FIGURE.height, 6, 6)
    }

    doc.setTextColor(15, 23, 42).setFont('helvetica', 'bold').setFontSize(15)
    doc.text(`${i + 1}. ${ex.name}`, textX, y + 18)
    doc.setFont('helvetica', 'normal').setFontSize(12)
    const lines = [`${ex.sets} sets × ${ex.reps} reps · ${SIDE_LABEL[ex.side]}`]
    const exercise = EXERCISES.find((m) => m.id === ex.exercise_id)
    if (exercise && ex.target_rom != null) {
      lines.push(`Target ${exercise.metric.toLowerCase()}: ${ex.target_rom}°`)
      lines.push(`${exercise.hint}: go as far as the dashed line in the picture.`)
    }
    doc.text(doc.splitTextToSize(lines.join('\n'), textWidth - (textX - margin)), textX, y + 40)
    y += blockHeight + 12
  })

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(9).setTextColor(100, 116, 139)
    doc.text(
      `This plan supports monitoring by your clinic and is not a diagnosis. QR code valid until ` +
        `${formatDate(plan.token_expires_at)}.  Page ${p} of ${pages}`,
      margin,
      PAGE.height - margin / 2,
    )
  }

  return doc
}

export async function downloadHandoutPdf(plan: CarePlan, joinToken: string): Promise<void> {
  const doc = await buildHandoutPdf(plan, joinToken)
  doc.save(`care-plan-${plan.assigned_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)
}
