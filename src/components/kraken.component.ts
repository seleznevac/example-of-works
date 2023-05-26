import { speedMode } from '../../framework/functions/speed/mode.func'
import AbstractComponent from '../../framework/components/abstract.component'
import SpineAssets, { Spine } from '../../framework/classes/spine.assets.class'
import { timelineCreate } from '../../framework/functions/timeline/create.funcs'
import { TNumberArray } from '../../application/server/src/gamelogic/gamelogic.declare'
import { IComponent } from '../../framework/extends/interfaces'
import { TTimeScale } from '../../framework-cascade/extends/short.types'
import { ISymbolComponentCascade } from './cascade/symbol.spine.component'
import { get } from '../../framework/classes/di.class'
import { TPixiPoint } from '../../framework/extends/short.types'
import { Point } from 'pixi.js'
import borderView from '../configs/borderview'
import { sleep } from '../../framework/functions/engine.funcs'
import { randomExclude } from '../../framework/functions/random/exclude.func'

export interface IKrakenComponent extends IComponent {
    animateKrakenStart([xPos, yPos]: TNumberArray, krakenWildsLength: number): Promise <void>
    animateKrakenWin(isSounds: boolean): Promise <void>
    animateKrakenHide(): Promise <void>
    animateSlimeStart(symbol: ISymbolComponentCascade, position: number, hp: number): Promise <void>
    animateSlimeStatic(position: number, hp: number): Promise <void>
    animateSlimeWin(position: number, hp: number, isSounds: boolean): Promise <void>
    animateSlimeCounterOff(winnersIndexes: TNumberArray, slimesHP: {[key: number]: number}, slimeHPDead: TNumberArray): Promise <boolean>
    animateSlimeDie(position: number, speed: [number, number]): Promise <void>
    getAllSlimesPositions(): Array <number>
    slimeDieAll(): void
}

export type TKrakenComponent = {
    Constructor?: (config : TKrakenComponent) => IKrakenComponent,
    timeScale?: TTimeScale
}

export type TKrakenAnimation = {
    start: string
    static: string
    win: string
}

export type TConfigKrakenAnimation = {
    9: TKrakenAnimation
    16: TKrakenAnimation
    25: TKrakenAnimation
}

export type TConfigSlime = {
    animateCounterOff: Array<string>
    animateCounterIdle: Array<string>
    animateStart: Array<string>
    animateStatic: Array<string>
    animateWin: Array<string>
}

enum ESounds {
    krakenScreamSmall = 'krakenScreamSmall'
}

const configKrakenAnimation: TConfigKrakenAnimation = {
    9: {
        start: '3x3_start',
        static: '3x3_static',
        win: '3x3_win'
    },
    16: {
        start: '4x4_start',
        static: '4x4_static',
        win: '4x4_win'
    },
    25: {
        start: '5x5_start',
        static: '5x5_static',
        win: '5x5_win'
    }
}

const configSlimes: TConfigSlime = {
    animateCounterOff: [
        null,
        'rope_counter_1_off',
        'rope_counter_2_off',
        'rope_counter_3_off',
        'rope_counter_4_off'
    ],
    animateCounterIdle: [
        null,
        'rope_counter_1_idle',
        'rope_counter_2_idle',
        'rope_counter_3_idle',
        'rope_counter_4_idle'
    ],
    animateStart: [
        null,
        null,
        'rope_start_counter_2',
        'rope_start_counter_3',
        'rope_start_counter_4'
    ],
    animateStatic: [
        'rope_static_counter_0',
        'rope_static_counter_1',
        'rope_static_counter_2',
        'rope_static_counter_3',
        'rope_static_counter_4'
    ],
    animateWin: [
        null,
        'rope_win_counter_1',
        'rope_win_counter_2',
        'rope_win_counter_3',
        'rope_win_counter_4'
    ]
}

const assetsKraken = 'spineKrakenWildSymbol'

/** Компонент Кракена */
export default class KrakenComponent extends AbstractComponent {

    protected _config: TKrakenComponent
    protected _timeScale: TTimeScale
    protected _symbolsCount = get('symbolsCount', 42)

    protected _animationName: TKrakenAnimation
    protected _animationKraken: Spine // Анимация Кракена

    // Slimes
    protected _slimes: Array <Spine> = Array(get <number>('symbolsCount', 42)).fill(null)

    protected _lastSound = {
        [ESounds.krakenScreamSmall]: ''
    }

    /** @constructor */
    constructor(config: TKrakenComponent) {
        super('kraken.component')

        this._timeScale = config.timeScale
        this.instance.sortableChildren = true
    }

    /** @destroy */
    async destroy(): Promise <this> {

        await Promise.all([
            this._animationKraken.destroy(),
            this.slimeDieAll()
        ])

        return this
    }

    /** 
     * Анимация появления Кракена
     * @param krakenWildsLength - длина массива krakenWilds (9, 16 или 25)
     */
    async animateKrakenStart([xPos, yPos]: TNumberArray, krakenWildsLength: number): Promise <void> {

        this._animationName = configKrakenAnimation[krakenWildsLength]

        this._animationKraken = SpineAssets.getSpineAnimation(assetsKraken)
        this._animationKraken.position.set(xPos, yPos)
        this._animationKraken.hide()

        this.instance.addChild(this._animationKraken)
        this._animationKraken.zIndex = this._symbolsCount + 1

        const timeline = timelineCreate()
            .call(() => {
                this._animationKraken.show()
                this._animationKraken.animate(this._animationName.start, false, false, speedMode(...this._timeScale))

                // озвучка анимации выпавшего на сцену кракена 
                this.emit('sounds:play', { name: 'kraken_drop' })
            }, null, 0)
            .call(() => {
                this._animationKraken.animate(this._animationName.static, true, true, speedMode(...this._timeScale))
            }, null, 1.5)

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()

    }

    /** Анимация выигрыша Кракена
     * @param isSounds - воспроизводить звук?
     */
    async animateKrakenWin(isSounds: boolean): Promise <void> {

        const timeline = timelineCreate()
            .call(() => {
                this._animationKraken.animate(this._animationName.win, false, false, speedMode(...this._timeScale))

                // Озвучка анимации большого Кракена
                isSounds && this.emit('sounds:play', { name: 'kraken_scream_big' })
            }, null, 0)
            .call(() => {
                this._animationKraken.animate(this._animationName.static, true, true, speedMode(...this._timeScale))
            }, null, 2.6)

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** Анимация исчезновения Кракена */
    async animateKrakenHide(): Promise <void> {

        const timeline = timelineCreate()
            .to(this._animationKraken, { alpha: 0, duration: 0.25, ease: 'circ.out' }, 0)
            .call(() => {
                this._animationKraken.destroy()
            }, null, 0.2)

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** */
    async animateSlimeStart(symbol: ISymbolComponentCascade, position: number, hp: number): Promise <void> {

        this._slimes[position] = SpineAssets.getSpineAnimation(assetsKraken)
        this._slimes[position].position.set(symbol.position.x, symbol.position.y)
        this._slimes[position].hide()

        this.instance.addChild(this._slimes[position])
        this._slimes[position].zIndex = Math.abs(position - this._symbolsCount)

        this._slimes[position].show()
        await this._slimes[position].animate(configSlimes.animateStart[hp], false, false, speedMode(...this._timeScale))
        this.animateSlimeStatic(position, hp)

    }

    /** */
    async animateSlimeStatic(position: number, hp: number): Promise <void> {

        await this._slimes[position].animate(configSlimes.animateStatic[hp], true, true, speedMode(...this._timeScale))
    }

    /** */
    async animateSlimeIdle(position: number, hp: number): Promise <void> {

        await this._slimes[position].animate(configSlimes.animateCounterIdle[hp], true, true, speedMode(...this._timeScale))
    }

    /** */
    async animateSlimeWin(position: number, hp: number, isSounds: boolean): Promise <void> {

        const prevHp = hp + 1

        // озвучка анимации маленького Кракена 1x1
        if (isSounds) {
            this._lastSound[ESounds.krakenScreamSmall] = randomExclude(['kraken_scream_small_1', 'kraken_scream_small_2', 'kraken_scream_small_3'], this._lastSound[ESounds.krakenScreamSmall])
            this.emit('sounds:play', { name: this._lastSound[ESounds.krakenScreamSmall] })
        }

        await this._slimes[position].animate(configSlimes.animateWin[prevHp], false, false, speedMode(...this._timeScale))
        this.animateSlimeIdle(position, prevHp)
    }

    /** */
    async animateSlimeCounterOff(winnersIndexes: TNumberArray, slimesHP: {[key: number]: number}, slimeHPDead: TNumberArray): Promise <boolean> {

        const timeline = timelineCreate()
        const time: [number, number] = [1.2, 0.7]

        let isHittedSlime = false // есть Slime в кластерах?

        for (let i = 0; i < winnersIndexes.length; i ++) {

            const position = winnersIndexes[i]

            if (slimesHP[position] !== undefined) {

                isHittedSlime = true
                const hp = slimesHP[position]

                timeline.call(() => this._slimes[position].animate(configSlimes.animateCounterOff[hp + 1], false, false, speedMode(...this._timeScale)), null, 0)
                timeline.call(() => this.animateSlimeStatic(position, hp), null, speedMode(...time))
            }

            if (slimeHPDead.includes(position)) {

                timeline.call(() => this._slimes[position].animate(configSlimes.animateCounterOff[1], false, false, speedMode(...this._timeScale)), null, 0)
                timeline.call(() => this.animateSlimeDie(position, [1.2, 1.3]), null, speedMode(...time))
            }
        }

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()

        return isHittedSlime
    }

    /** */
    async animateSlimeDie(position: number, time: [number, number] = [1, 1]): Promise <void> {

        let positionNew: TPixiPoint
        let ease: { x: string | gsap.EaseFunction, y: string | gsap.EaseFunction }

        switch (true) {
            case borderView.isMobileLandscape:
                positionNew = new Point(750, 105)
                ease = { x: 'none', y: 'power4.in' }
                break
            case borderView.isMobilePortrait:
                positionNew = new Point(180, borderView.gameHeight + borderView.gameInnerBottom / borderView.gameScale + 90 / borderView.gameScale)
                ease = { x: 'power4.in', y: 'none' }
                break
            default:
                positionNew = new Point(-600, 100)
                ease = { x: 'none', y: 'power4.in' }
                break
        }

        const timeline = timelineCreate()
            .call(() => this._slimes[position].animate(configSlimes.animateCounterOff[1], false, false, speedMode(...this._timeScale)), null, 0)
            .to(this._slimes[position].position, { x: positionNew.x, duration: speedMode(...time), ease: ease.x }, 0)
            .to(this._slimes[position].position, { y: positionNew.y, duration: speedMode(...time), ease: ease.y }, 0)
            .to(this._slimes[position], { alpha: 0, duration: speedMode(...time) / 4, ease: 'power1.in' }, 3 * speedMode(...time) / 4)
            .to(this._slimes[position].scale, { x: 0.4, y: 0.4, duration: speedMode(...time), ease: 'back.in(2)' }, 0)

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()

        if (this._slimes[position] !== null) {
            this._slimes[position].hide()
            this._slimes[position].destroy()
            this._slimes[position] = null
        }

    }

    /** */
    getAllSlimesPositions(): Array <number> {

        return this._slimes.map((slime, idx) => {
            if (slime !== null) return idx
        }).filter(position => position !== undefined)
    }

    /** */
    async slimeDieAll(): Promise <void> {

        await sleep(speedMode(1300, 1100))

        const timeline = timelineCreate()

        for (const position in this._slimes) {
            if (this._slimes[position] !== null) {
                timeline
                    .to(this._slimes[position], { alpha: 0, duration: 0.4 }, 0)
                    .call(() => {
                        this._slimes[position].destroy()
                        this._slimes[position] = null
                    }, null, 0.4)
            }
        }

        timeline.timeScale(speedMode(...this._timeScale))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** */
    async draw(): Promise <this> {

        return this
    }

}
