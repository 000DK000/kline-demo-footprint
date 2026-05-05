/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Nullable from '../common/Nullable'
import type { VisibleRangeData, KLineData } from '../common/Data'
import type BarSpace from '../common/BarSpace'
import { isValid } from '../common/utils/typeChecks'
import type { EventHandler } from '../common/EventHandler'
import type { CandleType, CandleBarColor, RectStyle, CandleFootprintStyle } from '../common/Styles'

import type { Axis } from '../component/Axis'
import type { FigureCreate } from '../component/Figure'
import type { RectAttrs } from '../extension/figure/rect'

import ChildrenView from './ChildrenView'

import { PaneIdConstants } from '../pane/types'

export interface CandleBarOptions {
  type: Exclude<CandleType, 'area'>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  private readonly _boundCandleBarClickEvent = (data: VisibleRangeData) => () => {
    this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', data)
    return false
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const pane = this.getWidget().getPane()
    const isMain = pane.getId() === PaneIdConstants.CANDLE
    const chartStore = pane.getChart().getChartStore()
    const candleStyles = pane.getChart().getStyles().candle
    const candleBarOptions = this.getCandleBarOptions()
    if (candleBarOptions !== null) {
      const { type, styles } = candleBarOptions
      let ohlcSize = 0
      let halfOhlcSize = 0
      if (candleBarOptions.type === 'ohlc') {
        const { gapBar } = chartStore.getBarSpace()
        ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
        if (ohlcSize > 2 && ohlcSize % 2 === 1) {
          ohlcSize--
        }
        halfOhlcSize = Math.floor(ohlcSize / 2)
      }
      const yAxis = pane.getAxisComponent()
      this.eachChildren((visibleData, barSpace) => {
        const { x, data: { current, prev } } = visibleData
        if (isValid(current)) {
          const { open, high, low, close } = current
          const comparePrice = styles.compareRule === 'current_open' ? open : (prev?.close ?? close)
          const colors: string[] = []
          if (close > comparePrice) {
            colors[0] = styles.upColor
            colors[1] = styles.upBorderColor
            colors[2] = styles.upWickColor
          } else if (close < comparePrice) {
            colors[0] = styles.downColor
            colors[1] = styles.downBorderColor
            colors[2] = styles.downWickColor
          } else {
            colors[0] = styles.noChangeColor
            colors[1] = styles.noChangeBorderColor
            colors[2] = styles.noChangeWickColor
          }
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [
            openY, closeY,
            yAxis.convertToPixel(high),
            yAxis.convertToPixel(low)
          ]
          priceY.sort((a, b) => a - b)

          const correction = barSpace.gapBar % 2 === 0 ? 1 : 0
          let rects: Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> = []
          switch (type) {
            case 'footprint': {
              const drawn = this._drawFootprint(ctx, x, barSpace, correction, current, colors, yAxis, candleStyles.footprint)
              if (!drawn) {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'candle_solid': {
              rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_stroke': {
              rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_up_stroke': {
              if (close > open) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'candle_down_stroke': {
              if (open > close) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'ohlc': {
              rects = [
                {
                  name: 'rect',
                  attrs: [
                    {
                      x: x - halfOhlcSize,
                      y: priceY[0],
                      width: ohlcSize,
                      height: priceY[3] - priceY[0]
                    },
                    {
                      x: x - barSpace.halfGapBar,
                      y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    },
                    {
                      x: x + halfOhlcSize,
                      y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    }
                  ],
                  styles: { color: colors[0] }
                }
              ]
              break
            }
          }
          rects.forEach(rect => {
            let handler: Nullable<EventHandler> = null
            if (isMain) {
              handler = {
                mouseClickEvent: this._boundCandleBarClickEvent(visibleData)
              }
            }
            this.createFigure(rect, handler ?? undefined)?.draw(ctx)
          })
        }
      })
    }
  }

  protected getCandleBarOptions (): Nullable<CandleBarOptions> {
    const candleStyles = this.getWidget().getPane().getChart().getStyles().candle
    return {
      type: candleStyles.type as Exclude<CandleType, 'area'>,
      styles: candleStyles.bar
    }
  }

  private _createSolidBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: {
          x,
          y: priceY[0],
          width: 1,
          height: priceY[3] - priceY[0]
        },
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke_fill',
          color: colors[0],
          borderColor: colors[1]
        }
      }
    ]
  }

  private _createStrokeBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: [
          {
            x,
            y: priceY[0],
            width: 1,
            height: priceY[1] - priceY[0]
          },
          {
            x,
            y: priceY[2],
            width: 1,
            height: priceY[3] - priceY[2]
          }
        ],
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke',
          borderColor: colors[1]
        }
      }
    ]
  }

  private _drawFootprint (
    ctx: CanvasRenderingContext2D,
    x: number,
    barSpace: BarSpace,
    correction: number,
    current: Nullable<KLineData>,
    colors: string[],
    yAxis: Axis,
    styles: CandleFootprintStyle
  ): boolean {
    interface FootprintLevel { price: number; bid?: number; ask?: number }
    interface CandleFootprint { step?: number; levels?: FootprintLevel[] }

    const fp = current?.footprint as CandleFootprint | undefined
    if (fp == null || !Array.isArray(fp.levels) || fp.levels.length === 0) return false

    const step = fp.step
    if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0) return false

    const candleWidth = barSpace.gapBar + correction
    const left = x - barSpace.halfGapBar
    const padding = Math.max(0, Math.round(styles.padding))
    const innerWidth = Math.max(0, candleWidth - padding * 2)
    const columnGap = Math.max(0, Math.round(styles.columnGap))
    const colWidth = Math.max(0, Math.floor((innerWidth - columnGap) / 2))
    if (colWidth <= 2) return false

    let maxCell = 0
    let pocPrice: number | null = null
    for (const l of fp.levels) {
      const bid = Number(l.bid ?? 0)
      const ask = Number(l.ask ?? 0)
      const total = bid + ask
      if (total > maxCell) {
        maxCell = total
        pocPrice = l.price
      }
    }
    if (!(maxCell > 0)) return false

    const minAlpha = Math.min(styles.maxAlpha, Math.max(0, styles.minAlpha))
    const maxAlpha = Math.min(1, Math.max(minAlpha, styles.maxAlpha))

    const bidColor = styles.bidColor !== '' ? styles.bidColor : colors[0]
    const askColor = styles.askColor !== '' ? styles.askColor : colors[0]
    const pocColor = styles.pocColor

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${styles.fontWeight} ${styles.fontSize}px ${styles.fontFamily}`

    for (const l of fp.levels) {
      const price = Number(l.price)
      const bid = Number(l.bid ?? 0)
      const ask = Number(l.ask ?? 0)

      const topPx = yAxis.convertToPixel(price + step / 2)
      const bottomPx = yAxis.convertToPixel(price - step / 2)
      const y = Math.min(topPx, bottomPx)
      const h = Math.max(1, Math.abs(bottomPx - topPx))

      const bidAlpha = minAlpha + (bid / maxCell) * (maxAlpha - minAlpha)
      const askAlpha = minAlpha + (ask / maxCell) * (maxAlpha - minAlpha)

      // Bid column (left)
      if (bid > 0) {
        ctx.fillStyle = this._withAlpha(bidColor, bidAlpha)
        ctx.fillRect(left + padding, y, colWidth, h)
      }
      // Ask column (right)
      if (ask > 0) {
        ctx.fillStyle = this._withAlpha(askColor, askAlpha)
        ctx.fillRect(left + padding + colWidth + columnGap, y, colWidth, h)
      }

      const isPoc = pocPrice != null && price === pocPrice
      if (isPoc) {
        ctx.strokeStyle = pocColor
        ctx.lineWidth = 1
        ctx.strokeRect(left + padding + 0.5, y + 0.5, colWidth * 2 + columnGap - 1, h - 1)
      }

      // Text (only if enough vertical space)
      if (h >= styles.fontSize + 2) {
        // Bid text
        if (bid > 0) {
          ctx.fillStyle = bidAlpha > 0.45 ? styles.textColor : styles.textColorLight
          ctx.fillText(this._formatVol(bid), left + padding + colWidth / 2, y + h / 2)
        }
        // Ask text
        if (ask > 0) {
          ctx.fillStyle = askAlpha > 0.45 ? styles.textColor : styles.textColorLight
          ctx.fillText(this._formatVol(ask), left + padding + colWidth + columnGap + colWidth / 2, y + h / 2)
        }
      }
    }

    ctx.restore()
    return true
  }

  private _withAlpha (hexOrRgba: string, alpha: number): string {
    // Supports hex like #RRGGBB / #RGB. For anything else, fall back unchanged.
    if (hexOrRgba.startsWith('#')) {
      const hex = hexOrRgba.slice(1)
      const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
      const r = parseInt(full.slice(0, 2), 16)
      const g = parseInt(full.slice(2, 4), 16)
      const b = parseInt(full.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${alpha})`
    }
    return hexOrRgba
  }

  private _formatVol (value: number): string {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`
    if (abs >= 10) return value.toFixed(0)
    if (abs >= 1) return value.toFixed(2)
    return value.toFixed(4)
  }
}
