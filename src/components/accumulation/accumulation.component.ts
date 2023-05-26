import * as PIXI from 'pixi.js'
import borderView from '../../configs/borderview'
import Assets from '../../../framework/classes/assets.class'
import * as Short from '../../../framework/extends/short.types'
import Container from '../../../framework/classes/container.class'
import TextComponent from '../../../framework/components/text.component'
import skipable from '../../../framework-cascade/classes/skipable.class'
import AbstractComponent from '../../../framework/components/abstract.component'

import { EPivot } from '../../../framework/extends/enum.types'
import { sleep } from '../../../framework/functions/engine.funcs'
import { get, registry } from '../../../framework/classes/di.class'
import { TNumberArray } from '../../../framework/extends/short.types'
import { speedMode } from '../../../framework/functions/speed/mode.func'
import { TGsapTimeline } from '../././../../framework/extends/short.types'
import SpineAssets, { Spine } from '../../../framework/classes/spine.assets.class'
import { timelineCreate } from '../../../framework/functions/timeline/create.funcs'
import { randomExclude } from '../../../framework/functions/random/exclude.func'

type TAccumulationData = {
    totalScore: number, // полный score, с учётом предыдущих
    charge: number, // сколько коллектов заполнено
    newSpin: boolean // начало спина
}

type TDrawScoreData = {
    startFrom: number,
    additionalScore: number,
    maxScores: number,
    time: number
}

enum EBigCircleAnimations {
    regular = 'regular',
    toFree = 'regular_free',
    free = 'free'
}

enum ESmallCircleAnimations {
    regular = 'regular',
    toFree = 'to_free',
    free = 'free'
}

enum EStarAnimations {
    toFree = 'to_free',
    stop = 'stop',
    win = 'win'
}

enum EWaveAnimations {
    winSmall = 'win_small',
    winBig = 'win_big'
}

enum EArrowAnimations {
    explosion = 'explosion',
    start = 'start',
    stop = 'stop',
    end = 'end',
    win = 'win'
}

enum ESounds {
    cannonIgnites = 'cannonIgnites',
    cannonShoots = 'cannonShoots',
    compassActivate = 'compassActivate'
}

const animations = {
    assetSmallCircleName: 'spineAccumulationSmallCircle',
    assetBigCircleName: 'spineAccumulationBigCircle',
    assetWaveName: 'spineAccumulationWave',
    assetStarName: 'spineAccumulationStar',
    assetArrowName: 'spineAccumulationArrow'
}

const styleScore = new PIXI.TextStyle({
    fill: 0xFFFFFF,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: 'Roboto',
    letterSpacing: 2,
    stroke: 0x723E12,
    strokeThickness: 2,
    align: 'center'
})

const AAssets = [
    'circle.png',
    'edge_green.png',
    'edge_red.png',
    'score-separate-line.png'
]

const assetsAccumulation = 'accumulation'

const mobilePortraitScale = 0.45
const mobileLandscapeScale = 0.6

let drawingCircle = false // Рисуется ли сейчас маска накопления?

/** Получение текстуры в зависимости от type device */
export function getTexture(name: string): PIXI.Texture {

    const prefix = borderView.isDesktop ? '' : borderView.isLandscape ? 'landscape-' : 'portrait-'
    return Assets.getTexture(assetsAccumulation, [prefix, name].join(''))
}

/**
 * Общий компонент накопления
 */
export default class AccumulationComponent extends AbstractComponent {

    protected _driver: PIXI.Application = registry <PIXI.Application>('driver') // driver из engine.class.ts

    protected _configRegularScore: TNumberArray = get('configRegularScore', [])
    protected _configFreespinsScore: TNumberArray = get('configFreespinsScore', [])

    // Цифровое отображение накопления
    protected _fullSmallCircleScores = this._configRegularScore.slice(0, 4).reduce((acc, score) => acc + score) // Количество очков (шагов) целого Small круга
    protected _fullBigCircleScores = this._configRegularScore.slice(4).reduce((acc, score) => acc + score) // Количество очков (шагов) целого Big круга
    protected _allRegularScores = this._configRegularScore.reduce((acc, score) => acc + score) // Максимальное количество очков в regular

    protected _isFreespins = false

    protected _currentScoreSmallCircle = 0 // Подсчёт score (внутренний круг)
    protected _currentScoreSmallCircleDone = false // Внутренний круг завершился
    protected _fromSmallToBig = false // Пополнение во внутреннем и во внешнем кругах одновременно
    protected _currentScoreBigCircle = 0 // Подсчёт score (внешний круг)
    protected _currentScoreBigCircleDone = false // Внешний круг завершился

    protected _currentQuarterСircle = 1 // Текущая четверь окружности (от 1 до 8, small и big окружности)

    protected _timeline: TGsapTimeline

    protected _smallCircleMaskEdgeEnd: PIXI.Sprite // Ребро, закрывающее край маски внутреннего круга 
    protected _smallFreespinsCircleMaskEdgeEnd: PIXI.Sprite // Ребро, закрывающее край маски внутреннего круга (FreeSpins)
    protected _animationSmallCircleMask: AccumulationMaskComponent
    protected _animationSmallCircle: Spine // Анимация внутреннего круга

    protected _bigCircleMaskEdgeStart: PIXI.Sprite // Ребро, закрывающее край маски внешнего круга
    protected _bigCircleMaskEdgeEnd: PIXI.Sprite // Ребро, закрывающее край маски внешнего круга
    protected _animationBigCircleMask: AccumulationMaskComponent
    protected _animationBigCircle: Spine // Анимация внешнего круга

    protected _animationWave: Spine // Анимация ударной волны
    protected _animationStar: Spine // Анимация звезды (центр компаса)

    // Анимации стрелок компаса (достижение коллекта)
    protected _animationArrowRight: Spine
    protected _animationArrowBottom: Spine
    protected _animationArrowLeft: Spine
    protected _animationArrowTop: Spine

    protected _arrows: Spine[] // Все 4 стрелки
    protected _arrowsActive = 0 // Заполненные коллекты
    protected _arrowsExploded = 0 // Взорвавшиеся стрелки (использованные коллекты)
    protected _arrowsAmount = 4

    protected _circle: PIXI.Sprite // Компас

    protected _currentScoreText: TextComponent // Отображение наполнения текущего score
    protected _maxScoreText: TextComponent // Отображение максимального score
    protected _scoreSeparateLine: PIXI.Sprite //  Линия, разделяющая current score и max score

    protected _fillTime = 1.012 // Время заполнения (фиксированное)
    protected _timeOneCircleStep = 0 // Время анимации 1 шага

    protected _lastSound = {
        [ESounds.cannonIgnites]: '',
        [ESounds.cannonShoots]: '',
        [ESounds.compassActivate]: ''
    }

    /** @constructor */
    constructor(name = 'accumulation.component') {
        super(name)

        this.instance.visible = false
    }

    /** */
    async create(instance?: Short.TSupportContainer): Promise <this> {

        await super.create(instance)

        // Маска-ребро для внешнего круга (открывающее ребро)
        this._bigCircleMaskEdgeStart = new PIXI.Sprite(getTexture(AAssets[1]))
        this._bigCircleMaskEdgeStart.alpha = 0
        this._bigCircleMaskEdgeStart.scale.set(1, 1.15)
        this._bigCircleMaskEdgeStart.anchor.set(0.5, 1)

        // Маска-ребро для внешнего круга (закрывающеее ребро)
        this._bigCircleMaskEdgeEnd = new PIXI.Sprite(getTexture(AAssets[1]))
        this._bigCircleMaskEdgeEnd.alpha = 0
        this._bigCircleMaskEdgeEnd.scale.set(1, 1.15)
        this._bigCircleMaskEdgeEnd.anchor.set(0.5, 1)

        // Внешний круг
        this._animationBigCircle = SpineAssets.getSpineAnimation(animations.assetBigCircleName)
        this._animationBigCircle.hide()

        this._animationBigCircleMask = new AccumulationMaskComponent(this._driver, 400)
        this._animationBigCircleMask.addChild(this._animationBigCircle)

        // Основа компаса
        this._circle = new PIXI.Sprite(getTexture(AAssets[0]))
        this._circle.anchor.set(0.5)
        this._circle.position.set(0, 130)

        // Маска-ребро для внутреннего круга
        this._smallCircleMaskEdgeEnd = new PIXI.Sprite(getTexture(AAssets[1]))
        this._smallCircleMaskEdgeEnd.alpha = 0
        this._smallCircleMaskEdgeEnd.scale.set(0.9)
        this._smallCircleMaskEdgeEnd.anchor.set(0.5, 1)

        // Маска-ребро для внутреннего круга (FreeSpins)
        this._smallFreespinsCircleMaskEdgeEnd = new PIXI.Sprite(getTexture(AAssets[2]))
        this._smallFreespinsCircleMaskEdgeEnd.alpha = 0
        this._smallFreespinsCircleMaskEdgeEnd.scale.set(0.9)
        this._smallFreespinsCircleMaskEdgeEnd.anchor.set(0.5, 1)

        // Внутренний круг
        this._animationSmallCircle = SpineAssets.getSpineAnimation(animations.assetSmallCircleName)
        this._animationSmallCircle.hide()

        this._animationSmallCircleMask = new AccumulationMaskComponent(this._driver, 400)
        this._animationSmallCircleMask.addChild(this._animationSmallCircle)

        // Волна
        this._animationWave = SpineAssets.getSpineAnimation(animations.assetWaveName)

        // Звезда
        this._animationStar = SpineAssets.getSpineAnimation(animations.assetStarName)

        // Стрелки компаса:
        this._animationArrowRight = SpineAssets.getSpineAnimation(animations.assetArrowName)
        this._animationArrowRight.hide()
        this._animationArrowRight.rotation = Math.PI / 2

        this._animationArrowBottom = SpineAssets.getSpineAnimation(animations.assetArrowName)
        this._animationArrowBottom.hide()
        this._animationArrowBottom.rotation = Math.PI

        this._animationArrowLeft = SpineAssets.getSpineAnimation(animations.assetArrowName)
        this._animationArrowLeft.hide()
        this._animationArrowLeft.rotation = -Math.PI / 2

        this._animationArrowTop = SpineAssets.getSpineAnimation(animations.assetArrowName)
        this._animationArrowTop.hide()
        this._animationArrowTop.rotation = 0

        this._arrows = [this._animationArrowRight, this._animationArrowBottom, this._animationArrowLeft, this._animationArrowTop]

        this.instance.addChild(this._bigCircleMaskEdgeStart, this._bigCircleMaskEdgeEnd, this._animationBigCircleMask, this._circle, this._smallCircleMaskEdgeEnd, this._animationSmallCircleMask, this._animationWave, this._animationStar)
        this.instance.addChild(this._animationArrowRight, this._animationArrowBottom, this._animationArrowLeft, this._animationArrowTop)

        // Текстовое отображение накопления
        this._currentScoreText = new TextComponent('Current score', `${this._currentScoreSmallCircle}`, styleScore)
        this._currentScoreText.setPivot(EPivot.CENTER, EPivot.CENTER)

        this._maxScoreText = new TextComponent('Max score', `${this._getCurrentMaxScore()}`, styleScore)
        this._maxScoreText.setPivot(EPivot.CENTER, EPivot.CENTER)

        this._scoreSeparateLine = new PIXI.Sprite(getTexture(AAssets[3]))

        await Promise.all([
            this._currentScoreText.create(this.instance),
            this._maxScoreText.create(this.instance)
        ])

        this.instance.addChild(this._scoreSeparateLine)

        if (borderView.isDesktop) {

            this._bigCircleMaskEdgeStart.position.set(0, 120)
            this._bigCircleMaskEdgeEnd.position.set(-2, 120)
            this._animationBigCircle.position.set(0, 120)

            this._smallCircleMaskEdgeEnd.position.set(-2, 120)
            this._smallFreespinsCircleMaskEdgeEnd.position.set(0, 118)
            this._animationSmallCircle.position.set(-2, 122)

            this._animationWave.position.set(0, 120)
            this._animationStar.position.set(0, 120)

            this._animationArrowRight.position.set(98, 119)
            this._animationArrowBottom.position.set(0, 219)
            this._animationArrowLeft.position.set(-98, 119)
            this._animationArrowTop.position.set(0, 23)

            this._currentScoreText.position.set(0, 98)
            this._maxScoreText.position.set(0, 142)
            this._scoreSeparateLine.position.set(-30, 120)
        }

        this.draw()

        return this
    }

    /** @destroy */
    async destroy(): Promise <this> {

        await Promise.all([
            this._animationBigCircle.destroy(),
            this._animationBigCircleMask.destroy(),
            this._bigCircleMaskEdgeStart.destroy(),
            this._bigCircleMaskEdgeEnd.destroy(),
            this._circle.destroy(),
            this._animationSmallCircle.destroy(),
            this._animationSmallCircleMask.destroy(),
            this._smallCircleMaskEdgeEnd.destroy(),
            this._smallFreespinsCircleMaskEdgeEnd.destroy(),
            this._animationWave.destroy(),
            this._animationStar.destroy(),
            this._animationArrowRight.destroy(),
            this._animationArrowBottom.destroy(),
            this._animationArrowLeft.destroy(),
            this._animationArrowTop.destroy(),
            this._currentScoreText.destroy(),
            this._maxScoreText.destroy(),
            this._scoreSeparateLine.destroy()
        ])

        return this
    }

    /** */
    async draw(): Promise <this> {

        switch (true) {
            case borderView.isMobilePortrait:
                this._animationBigCircle.scale.set(mobilePortraitScale)
                this._animationSmallCircle.scale.set(mobilePortraitScale)
                this._animationStar.scale.set(mobilePortraitScale)
                this._animationWave.scale.set(mobilePortraitScale)
                this._animationArrowRight.scale.set(mobilePortraitScale)
                this._animationArrowBottom.scale.set(mobilePortraitScale)
                this._animationArrowLeft.scale.set(mobilePortraitScale)
                this._animationArrowTop.scale.set(mobilePortraitScale)

                this._animationArrowRight.position.set(43, 128)
                this._animationArrowBottom.position.set(0, 171)
                this._animationArrowLeft.position.set(-43, 128)
                this._animationArrowTop.position.set(0, 85)

                this._currentScoreText.setStyles(new PIXI.TextStyle(Object.assign({}, styleScore, { fontSize: 11, lineHeight: 13 })))
                this._maxScoreText.setStyles(new PIXI.TextStyle(Object.assign({}, styleScore, { fontSize: 11, lineHeight: 13 })))
                this._currentScoreText.position.set(1, 118)
                this._maxScoreText.position.set(1, 138)

                this._scoreSeparateLine.texture = getTexture(AAssets[3])
                this._scoreSeparateLine.position.set(-14, 127)
                break

            case borderView.isMobileLandscape:
                this._animationBigCircle.scale.set(mobileLandscapeScale)
                this._animationSmallCircle.scale.set(mobileLandscapeScale)
                this._animationStar.scale.set(mobileLandscapeScale)
                this._animationWave.scale.set(mobileLandscapeScale)
                this._animationArrowRight.scale.set(mobileLandscapeScale)
                this._animationArrowBottom.scale.set(mobileLandscapeScale)
                this._animationArrowLeft.scale.set(mobileLandscapeScale)
                this._animationArrowTop.scale.set(mobileLandscapeScale)

                this._animationArrowRight.position.set(58, 128)
                this._animationArrowBottom.position.set(0, 186)
                this._animationArrowLeft.position.set(-59, 128)
                this._animationArrowTop.position.set(0, 70)

                this._currentScoreText.setStyles(new PIXI.TextStyle(Object.assign({}, styleScore, { fontSize: 14, lineHeight: 16 })))
                this._maxScoreText.setStyles(new PIXI.TextStyle(Object.assign({}, styleScore, { fontSize: 14, lineHeight: 16 })))
                this._currentScoreText.position.set(1, 116)
                this._maxScoreText.position.set(1, 139)

                this._scoreSeparateLine.texture = getTexture(AAssets[3])
                this._scoreSeparateLine.position.set(-18, 127)
                break
        }

        if (borderView.isMobile) {

            this._bigCircleMaskEdgeStart.position.set(0, 130)
            this._bigCircleMaskEdgeEnd.position.set(0, 130)
            this._animationBigCircle.position.set(-2, 128)

            this._animationSmallCircle.position.set(-2, 130)
            this._smallCircleMaskEdgeEnd.position.set(0, 130)
            this._smallFreespinsCircleMaskEdgeEnd.position.set(0, 130)

            this._animationWave.position.set(0, 128)
            this._animationStar.position.set(0, 128)

            this._circle.texture = getTexture(AAssets[0])
            this._bigCircleMaskEdgeStart.texture = getTexture(AAssets[1])
            this._bigCircleMaskEdgeEnd.texture = getTexture(AAssets[1])
            this._smallCircleMaskEdgeEnd.texture = getTexture(AAssets[1])
            this._smallFreespinsCircleMaskEdgeEnd.texture = getTexture(AAssets[2])

        }

        return this
    }

    /** Анимация наполнения */
    async animateAccumulation(accumulationData: TAccumulationData): Promise <void> {
        const { totalScore, charge, newSpin } = accumulationData

        if (totalScore === 0) return

        // Счётчик накоплений
        const drawScoreData: TDrawScoreData = {
            startFrom: 0,
            additionalScore: 0,
            maxScores: 0,
            time: this._fillTime
        }

        let [additionalScore, diff] = [0, 0] // [Количество score за этот spin, Разница Score между Big и Smmall окружностями]

        this._timeline = timelineCreate()
            .addLabel('start', 0)
            .addLabel('accumulate', 0.45)
            .addLabel('completed', 1)

        newSpin && this._timeline // Обнуляем маску (накопление) для нового спина
            .call(() => {
                this._animationSmallCircleMask.resetAccumulationCircle(this._smallCircleMaskEdgeEnd, true)
                this._animationBigCircleMask.resetAccumulationCircle(this._bigCircleMaskEdgeEnd, true)
            }, null, 0)

        ! this._currentScoreSmallCircle && this._timeline.call(() => { // Первый запуск анимации внутреннего круга
            this._animationSmallCircle.show()
            this._isFreespins
                ? this._animationSmallCircle.animate(ESmallCircleAnimations.free, true, true, 1)
                : this._animationSmallCircle.animate(ESmallCircleAnimations.regular, true, true, 1)
        }, null, 'start')

        ! this._currentScoreBigCircle && this._timeline.call(() => { // Первый запуск анимации внешнего круга
            this._animationBigCircle.show()
            this._animationBigCircle.animate(EBigCircleAnimations.regular, true, true, 1)
        }, null, 'start')

        if (! this._currentScoreSmallCircleDone) { // Не начался 2-ой круг (внутренний)

            [additionalScore, diff] = this._addScore(totalScore)

            additionalScore && (this._timeOneCircleStep = this._fillTime / (additionalScore + diff)) // Обновляем время заполнения 1 шага

            // Отдельная переменная, чтобы не конфликтовать с big circle
            const additionalScoreSmallCircle = additionalScore

            this._timeline
                .call(() => {
                    if (additionalScore) {
                        this._lastSound[ESounds.compassActivate] = randomExclude(['compass_activate_1', 'compass_activate_2', 'compass_activate_3', 'compass_activate_4'], this._lastSound[ESounds.compassActivate])
                        this.emit('sounds:play', { name: this._lastSound[ESounds.compassActivate] })
                    }

                    this._animationStar.show()
                    additionalScoreSmallCircle && this._animationStar.animate(EStarAnimations.win, false, false, speedMode(1, 1.5))
                }, null, 'start')
                .call(() => {
                    this._animationWave.show()
                    additionalScoreSmallCircle && this._animationWave.animate(EWaveAnimations.winSmall, false, false, speedMode(1, 1.5))
                }, null, 'accumulate-=0.3')
                .call(() => {
                    additionalScoreSmallCircle && this._arrows.forEach(arrow => {
                        arrow.animate(EArrowAnimations.win, false, false, speedMode(1, 1.5))
                    })
                }, null, 'accumulate-=0.45')
                .call(() => {
                    const maskEdge = this._isFreespins ? this._smallFreespinsCircleMaskEdgeEnd : this._smallCircleMaskEdgeEnd
                    maskEdge.alpha = 1

                    const faster = (additionalScoreSmallCircle + diff) / (additionalScoreSmallCircle + diff - this._currentScoreBigCircle)

                    this._animationSmallCircleMask.increaseAccumulationCircle(
                        this._currentScoreSmallCircle, false, this._isFreespins, faster, maskEdge
                    )

                    // Цифровое отображение накопления - regular / freespins
                    drawScoreData.startFrom = this._currentScoreSmallCircle - additionalScoreSmallCircle
                    drawScoreData.additionalScore = additionalScoreSmallCircle
                    drawScoreData.maxScores = this._getCurrentMaxScore()
                    drawScoreData.time = this._fillTime / faster

                    this._drawCurrentScore(drawScoreData)

                }, null, 'accumulate')

            this._activateArrows(totalScore - additionalScoreSmallCircle - diff, charge)
        }

        if (this._currentScoreSmallCircleDone) { // Закончился внутренний круг

            let additionalScoreBigCircle = 0 // Отдельная переменная, чтобы не конфликтовать со small circle

            if (! this._currentScoreBigCircleDone) { // Не закончился внешний круг

                if (! this._fromSmallToBig) {
                    [additionalScore, diff] = this._addScore(totalScore)
                    additionalScore && (this._timeOneCircleStep = this._fillTime / additionalScore) // Обновляем время заполнения 1 шага
                }

                additionalScoreBigCircle = additionalScore

                if (additionalScoreBigCircle || diff) {

                    const time = this._fromSmallToBig ? `accumulate+=${(additionalScoreBigCircle + diff - this._currentScoreBigCircle) * this._timeOneCircleStep + this._timeOneCircleStep}` : 'accumulate'

                    this._timeline
                        .call(() => {
                            this._lastSound[ESounds.compassActivate] = randomExclude(['compass_activate_1', 'compass_activate_2', 'compass_activate_3', 'compass_activate_4'], this._lastSound[ESounds.compassActivate])
                            this.emit('sounds:play', { name: this._lastSound[ESounds.compassActivate] })

                            this._animationStar.show()
                            additionalScoreBigCircle && this._animationStar.animate(EStarAnimations.win, false, false, speedMode(1, 1.5))
                        }, null, 'start')
                        .call(() => {
                            this._animationWave.show()
                            additionalScoreBigCircle && this._animationWave.animate(EWaveAnimations.winBig, false, false, speedMode(1, 1.5))
                        }, null, 'accumulate-=0.3')
                        .call(() => {
                            this._arrows.forEach(arrow => {
                                arrow.animate(EArrowAnimations.win, false, false, speedMode(1, 1.5))
                            })
                        }, null, 'accumulate-=0.45')
                        .call(() => {
                            this._bigCircleMaskEdgeStart.alpha = 1
                            this._bigCircleMaskEdgeEnd.alpha = 1

                            const faster = this._fromSmallToBig ? ((diff + additionalScoreBigCircle) / diff) : 1

                            // Если ещё не закончила рисоваться предыдущая маска ==> ждём
                            const accumulationMaskTimer = setInterval(() => {

                                if (! drawingCircle) {
                                    this._animationBigCircleMask.increaseAccumulationCircle(
                                        this._currentScoreBigCircle, true, this._isFreespins, faster, this._bigCircleMaskEdgeEnd, this._bigCircleMaskEdgeStart
                                    )

                                    clearInterval(accumulationMaskTimer)
                                }
                            }, (this._timeOneCircleStep / 3) * 1000)

                            // Цифровое отображение накопления - overlect
                            drawScoreData.startFrom = this._fromSmallToBig
                                ? this._currentScoreSmallCircle + this._currentScoreBigCircle - diff
                                : this._currentScoreSmallCircle + this._currentScoreBigCircle - additionalScoreBigCircle
                            drawScoreData.additionalScore = this._fromSmallToBig ? diff : additionalScoreBigCircle
                            drawScoreData.maxScores = this._getCurrentMaxScore()
                            drawScoreData.time = this._fillTime / faster

                            this._drawCurrentScore(drawScoreData)

                            this._fromSmallToBig && (this._fromSmallToBig = false)
                        }, null, `${time}`)
                }
            }
        }

        return skipable.wait(
            () => this._timeline.timeScale(speedMode(1, 1.5)).then(),
            () => this._timeline.timeScale(speedMode(1, 1.5)),
            () => {
                if (this._fromSmallToBig) {
                    this._timeline.timeScale(speedMode(1, 1.5)).then()
                } else {
                    this._timeline.progress(1)
                }
            }
        )
    }

    /** Переход во Freespins */
    async switchToFreespins(): Promise <void> {

        const timeline = timelineCreate()
            .call(() => { // Переход во FreeSpins
                this._animationSmallCircle.animate(ESmallCircleAnimations.toFree, false, false, speedMode(1, 1.2))
                this._animationBigCircle.animate(EBigCircleAnimations.toFree, false, false, speedMode(1, 1.2))
                this._animationStar.animate(EStarAnimations.toFree, false, false, speedMode(1, 1.2))
            }, null, 0)
            .to(this._arrows, { alpha: 0, duration: 0.2 }, 0)
            .call(() => {
                this._arrows.forEach(arrow => {
                    arrow.hide()
                    arrow.alpha = 1
                })

                this._arrowsActive = 0
                this._arrowsExploded = 0
            }, null, 0.4)
            .to(this._bigCircleMaskEdgeStart, { alpha: 0, duration: 0.2 }, 1)
            .to(this._bigCircleMaskEdgeEnd, { alpha: 0, duration: 0.2 }, 1)
            .call(() => { // Обнуляем маску
                this._animationSmallCircleMask.resetAccumulationCircle(this._smallCircleMaskEdgeEnd, true)
                this._animationBigCircleMask.resetAccumulationCircle(this._bigCircleMaskEdgeEnd, true)

                this._currentScoreBigCircleDone = true
                this._currentScoreSmallCircleDone = false
                this._currentScoreBigCircle = 0
                this._currentScoreSmallCircle = 0

                this._isFreespins = true

            }, null, 2)

        this.resetCounterScoreAnimation(timeline, 0.45)

        timeline.timeScale(speedMode(1, 1.5))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** Переход во Freespins без regular game */
    async forceToFreespins(): Promise <void> {
        this._arrowsActive = 0
        this._arrowsExploded = 0

        this._currentScoreBigCircleDone = true
        this._currentScoreSmallCircleDone = false
        this._currentScoreBigCircle = 0
        this._currentScoreSmallCircle = 0

        this._isFreespins = true

        this._timeline = timelineCreate()
        this.resetCounterScoreAnimation(this._timeline)

        this._timeline.timeScale(speedMode(1, 1.5))
        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }

    /** Получить максимальный score для текущей стадии накопления */
    protected _getCurrentMaxScore(): number {

        return this._isFreespins
            ? this._configFreespinsScore.slice(0, this._currentQuarterСircle).reduce((acc, score) => acc + score)
            : this._configRegularScore.slice(0, this._currentQuarterСircle).reduce((acc, score) => acc + score)
    }

    /** Добавление score
     * @param totalScore - полный score, с учётом предыдущих
     */
    protected _addScore(totalScore: number): TNumberArray {

        let [additionalScore, diff] = [0, 0] // [Сколько score добавляется за этот spin?, Разница Score между Big и Small окружностями?]

        if (this._currentScoreSmallCircle < this._fullSmallCircleScores) {
            additionalScore = totalScore - this._currentScoreSmallCircle
            this._currentScoreSmallCircle += additionalScore

            if (this._currentScoreSmallCircle > this._fullSmallCircleScores) { // При заходе на 2-ой круг
                diff = this._currentScoreSmallCircle - this._fullSmallCircleScores
                this._currentScoreSmallCircle -= diff // Не больше целой окружности 
                additionalScore -= diff
                this._currentScoreBigCircle += diff // Разница переходит в Big окружность

                this._currentScoreSmallCircleDone = true
                this._fromSmallToBig = true

            } else if (this._currentScoreSmallCircle === this._fullSmallCircleScores) {
                this._fromSmallToBig = false
                this._currentScoreSmallCircleDone = true
            }

        } else {

            additionalScore = totalScore - this._currentScoreSmallCircle - this._currentScoreBigCircle
            this._currentScoreBigCircle += additionalScore

            if (this._currentScoreBigCircle >= this._fullBigCircleScores) {
                this._currentScoreBigCircleDone = true
            }
        }

        return [additionalScore, diff]
    }

    /** Анимация активации стрелок при достижении коллекта
     * @param startScore - изначальное значение score (до обновления)
     * @param charge - количество активных стрелок (коллектов)
     */
    protected _activateArrows(startScore: number, charge: number): void {

        if (charge !== this._arrowsActive && charge <= this._arrowsAmount) {
            for (let i = this._arrowsActive; i < charge; i ++) {
                const collectPoint = this._isFreespins
                    ? this._configFreespinsScore.slice(0, i + 1).reduce((acc, score) => acc + score) // Score для достижения коллекта
                    : this._configRegularScore.slice(0, i + 1).reduce((acc, score) => acc + score) // Score для достижения коллекта
                const time = `${(collectPoint - startScore) * this._timeOneCircleStep + 0.4}`

                this._timeline
                    .call(() => {
                        this._lastSound[ESounds.cannonIgnites] = randomExclude(['cannon_ignites_1', 'cannon_ignites_2'], this._lastSound[ESounds.cannonIgnites])
                        this.emit('sounds:play', { name: this._lastSound[ESounds.cannonIgnites] })

                        this._arrows[i].show()
                        this._arrows[i].animate(EArrowAnimations.start, false, false, speedMode(1, 1.5))
                    }, null, `${time}`)

                this._arrowsActive = charge
            }
        }
    }

    /** Анимация взрыва стрелки */
    async explosionArrow(): Promise <void> {
        const arrowClonedEnd = this._arrows[this._arrowsExploded].clone('arrowClonedEnd') // Клон для одновременного запуска 2-х анимаций
        arrowClonedEnd.position.copyFrom(this._arrows[this._arrowsExploded])
        arrowClonedEnd.rotation = this._arrows[this._arrowsExploded].rotation

        const arrowClonedExplosion = this._arrows[this._arrowsExploded].clone('arrowClonedExplosion')
        arrowClonedExplosion.position.copyFrom(this._arrows[this._arrowsExploded])
        arrowClonedExplosion.rotation = this._arrows[this._arrowsExploded].rotation

        borderView.isMobileLandscape && arrowClonedEnd.scale.set(mobileLandscapeScale) && arrowClonedExplosion.scale.set(mobileLandscapeScale)
        borderView.isMobilePortrait && arrowClonedEnd.scale.set(0.435) && arrowClonedEnd.scale.set(0.435)

        arrowClonedEnd.hide()
        arrowClonedExplosion.hide()

        this.instance.addChild(arrowClonedEnd, arrowClonedExplosion)
        this.instance.setChildIndex(arrowClonedEnd, 10 + (this._arrowsExploded + 1)) // Подобие z-index
        this.instance.setChildIndex(arrowClonedExplosion, 11 + (this._arrowsExploded + 1))

        const timeline = timelineCreate()
            .call(() => {
                this._lastSound[ESounds.cannonShoots] = randomExclude(['cannon_shoots_1', 'cannon_shoots_2', 'cannon_shoots_3'], this._lastSound[ESounds.cannonShoots])
                this.emit('sounds:play', { name: this._lastSound[ESounds.cannonShoots] })

                arrowClonedEnd.show()
                arrowClonedEnd.animate(EArrowAnimations.end, false, false, speedMode(1, 1.5))

                arrowClonedExplosion.show()
                arrowClonedExplosion.animate(EArrowAnimations.explosion, false, false, speedMode(1, 1.5))

                this._arrows[this._arrowsExploded].show()
                this._arrows[this._arrowsExploded].animate(EArrowAnimations.start, false, false, speedMode(1, 1.5))

                this._arrows[this._arrowsExploded].alpha = 0.5
                this._arrowsExploded += 1
            }, null, 0)
            .call(() => {
                arrowClonedEnd.destroy()
                arrowClonedExplosion.destroy()
            }, null, 1)

        timeline.timeScale(speedMode(1, 1.5))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** Отрисовка числового отображения Score
     * @param drawScoreData - объект с новыми данными для обновления 
     */
    protected async _drawCurrentScore(drawScoreData: TDrawScoreData): Promise <void> {

        let { startFrom, additionalScore, maxScores, time } = drawScoreData

        this._currentScoreText.text = `${startFrom}`
        this._maxScoreText.text = `${maxScores}`

        for (let i = 1; i <= additionalScore; i ++) {
            if (startFrom + i > this._allRegularScores) break

            this._currentScoreText.text = `${startFrom + i}`

            // Изменение max score
            if (startFrom + i === maxScores) {
                this._currentQuarterСircle += 1
                await sleep(100)

                maxScores = this._getCurrentMaxScore()
                this._maxScoreText.text = `${maxScores}`
            }

            await sleep(speedMode(time, time / 2) * 1000 / additionalScore)
        }
    }

    /** Сброс наполнения */
    async resetAccumulation(): Promise <void> {

        if (this._currentScoreSmallCircle) {
            this._isFreespins
                ? this._animationSmallCircleMask.resetAccumulationCircle(this._smallFreespinsCircleMaskEdgeEnd)
                : this._animationSmallCircleMask.resetAccumulationCircle(this._smallCircleMaskEdgeEnd)
        }

        this._bigCircleMaskEdgeStart.alpha = 0
        this._bigCircleMaskEdgeEnd.alpha = 0
        this._smallCircleMaskEdgeEnd.alpha = 0
        this._smallFreespinsCircleMaskEdgeEnd.alpha = 0

        this._currentScoreSmallCircle = 0
        this._currentScoreSmallCircleDone = false
        this._currentScoreBigCircleDone = false

        this._fromSmallToBig = false

        const timeline = timelineCreate()

        this.resetArrowsAnimation(timeline, false)

        if (this._currentScoreBigCircle) {

            timeline
                .to(this._animationBigCircle, { alpha: 0, duration: 1 }, 0)
                .call(() => {
                    this._animationBigCircleMask.resetAccumulationCircle(this._bigCircleMaskEdgeEnd, true)
                    this._animationBigCircle.alpha = 1
                    this._currentScoreBigCircle = 0
                }, null, 1)
        }

        if (Number(this._currentScoreText.text) !== 0 || Number(this._maxScoreText.text) !== this._getCurrentMaxScore()) {
            this.resetCounterScoreAnimation(timeline)
        }

        timeline.timeScale(speedMode(1, 1.5))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()

    }

    /** Сброс отображения наполнения для каждого Freespin */
    async resetFreespinsCircleMask(): Promise <void> {
        if (this._currentScoreSmallCircle) {
            this._animationSmallCircleMask.resetAccumulationCircle(this._smallFreespinsCircleMaskEdgeEnd)
        }

        this._currentScoreSmallCircle = 0
        this._currentScoreSmallCircleDone = false
        this._currentScoreBigCircle = 0

        const timeline = timelineCreate()
        this.resetArrowsAnimation(timeline, true)

        timeline.timeScale(speedMode(1, 1.5))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** Анимация отключения arrows
     * @param timeline
     * @param isFreespins
     */
    async resetArrowsAnimation(timeline: TGsapTimeline, isFreespins: boolean): Promise <void> {

        if (Number(this._currentScoreText.text) !== 0 || Number(this._maxScoreText.text) !== this._getCurrentMaxScore()) {
            this.resetCounterScoreAnimation(timeline)
        }

        timeline
            .call(() => {
                this._arrows.forEach((arrow, idx) => {
                    (idx + 1 <= this._arrowsActive) && arrow.animate(EArrowAnimations.end, false, false, speedMode(1, 1.5))
                })

                this._isFreespins = isFreespins
            }, null, 0)
            .call(() => {
                this._arrows.forEach(arrow => {
                    arrow.alpha = 1
                    arrow.hide()
                })

                this._arrowsActive = 0
                this._arrowsExploded = 0
            }, null, 1)
    }

    /** Анимация обнуления счётчика
     * @param timeline
     */
    async resetCounterScoreAnimation(timeline: TGsapTimeline, time: string | number = 0): Promise <void> {

        this._currentQuarterСircle = 1

        timeline
            .to([this._currentScoreText, this._maxScoreText, this._scoreSeparateLine], { alpha: 0, duration: 0.3 }, time)
            .call(() => {
                const drawScoreData: TDrawScoreData = {
                    startFrom: 0,
                    additionalScore: 0,
                    maxScores: this._getCurrentMaxScore(),
                    time: this._fillTime
                }

                this._drawCurrentScore(drawScoreData)
            }, null, `${time}+0.45`)
            .to([this._currentScoreText, this._maxScoreText, this._scoreSeparateLine], { alpha: 1, duration: 0.3 }, `${time}+0.8`)
    }
}

export interface IDriver extends PIXI.Application {
    animationIncrease?(delta: number): void
    animationReset?(delta: number): void
}

/** Компонент для создания маски (динамический сектор круга) */
class AccumulationMaskComponent extends Container {

    protected _maskGraphics: PIXI.Graphics

    protected _driver: IDriver // driver из engine.class.ts
    protected _configRegularScore: TNumberArray = get('configRegularScore', [])
    protected _configFreespinsScore: TNumberArray = get('configFreespinsScore', [])

    protected _startAngle = -Math.PI / 2 // Начальный угол отрисовки (верхняя точка круга)

    protected _radius: number
    protected _phase = 0

    /** @constructor */
    constructor(driver: IDriver, radius: number) {
        super('mask.component')
        this._driver = driver
        this._radius = radius

        this._maskGraphics = new PIXI.Graphics()
        this._maskGraphics.lineStyle(5, 0xFFFFFF, 1)
        borderView.isDesktop ? this._maskGraphics.position.set(-2, 120) : this._maskGraphics.position.set(0, 130)
        this.setMask(this._maskGraphics)
    }

    /** Отрисовка маски (сектор круга)
     * @param endAngle - угол, на котором нужно остановить отрисовку маски
     */
    protected _drawMask(endAngle: number): void {
        this._maskGraphics.clear()
        this._maskGraphics.beginFill(0xFFFFFF, 1)
        this._maskGraphics.moveTo(0, 0)
        this._maskGraphics.arc(0, 0, this._radius, this._startAngle, endAngle)
        this._maskGraphics.endFill()
    }

    /** Обновление заполнения круга 
     * @param startScore - score, с которого начинается отрисовка маски
     * @param totalScore - score, на котором закончится отрисовка маски
     * @param faster - коэффициент ускорения заполнения (актуален при переходе с внутреннего круга на внешний)
     * @param endEdge - ребро, закрывающее маску
     * @param startEdge - ребро, открывающее маску
     */
    async increaseAccumulationCircle(totalScore: number, overlect: boolean, isFreespins: boolean, faster: number, endEdge: PIXI.Sprite, startEdge: PIXI.Sprite = null): Promise <void> {

        drawingCircle = true

        let prevPhase = this._phase // На случай захода на 2-ой круг

        const stopPercent = overlect
            ? this._getStopInPercentage(totalScore, this._configRegularScore.slice(4))
            : this._getStopInPercentage(totalScore, isFreespins ? this._configFreespinsScore : this._configRegularScore.slice(0, 4))

        const stop = 2 * Math.PI * stopPercent // Конец отрисовки маски в радианах

        const phaseDiff = stop - prevPhase // Разница фаз от начало отрисовки до конца (для регулировки скорости)

        if (phaseDiff <= 0.05) return

        // Анимация маски
        this._driver.animationIncrease = (delta: number) => {
            this._phase += delta / speedMode(60, 30) * phaseDiff * faster
            this._phase %= 2 * Math.PI

            const angle = this._phase + this._startAngle

            this._drawMask(angle)

            endEdge.rotation = this._phase // Поворачиваем закрывающее ребро маски

            if (this._phase >= stop || prevPhase > this._phase) {
                this._driver.ticker.remove(this._driver.animationIncrease)
                this._isFullCircle(prevPhase, startEdge, endEdge)
                this._phase = stop

                drawingCircle = false

                return
            }

            prevPhase = this._phase
        }

        this._driver.ticker.add(this._driver.animationIncrease)
    }

    /** Подстановка маски-круга, если заполнение = 2*PI
     * @param prevPhase - предыдущая фаза при отрисовке в this._drawMask()
     * @param startEdge - ребро, открывающее маску
     * @param endEdge - ребро, закрывающее маску
     */
    protected _isFullCircle(prevPhase: number, startEdge: PIXI.Sprite, endEdge: PIXI.Sprite): void {
        if (prevPhase > this._phase) {
            this._maskGraphics.clear()
            this._maskGraphics.beginFill(0xFFFFFF, 1)
            this._maskGraphics.drawCircle(0, 0, this._radius)
            this._maskGraphics.endFill()

            startEdge && (startEdge.alpha = 0)
            endEdge.alpha = 0
        }
    }

    /** Сброс накоплений
     * @param endEdge - ребро, закрывающее маску
     * @param forced - убрать маску мгновенно? (если заполнено до конца, то использовать force = true)
     */
    async resetAccumulationCircle(endEdge: PIXI.Sprite, forced = false): Promise <void> {

        if (forced) {
            this._phase = 0
            this._drawMask(this._startAngle)

            drawingCircle = false

            return
        }

        // Для полностью заполненного круга нужно уменьшить фазу
        if (this._phase < 0.06) {
            this._phase = 2 * Math.PI - 0.01
        }

        // Анимация маски
        this._driver.animationReset = (delta: number) => {
            isNaN(this._phase) && (this._phase = delta / speedMode(30, 20))

            this._phase -= delta / speedMode(30, 20)
            this._phase %= 2 * Math.PI

            if (this._phase <= delta / speedMode(30, 20)) {
                this._phase = 0
                endEdge.rotation = 0
                this._drawMask(this._startAngle)
                this._driver.ticker.remove(this._driver.animationReset)

                drawingCircle = false

                return
            }

            const angle = this._startAngle + this._phase

            this._drawMask(angle)

            endEdge.rotation = this._phase // Поворачиваем закрывающее ребро маски
        }

        this._driver.ticker.add(this._driver.animationReset)
    }

    /** Получение процента заполнения круга */
    protected _getStopInPercentage(value: number, sectors: TNumberArray): number { // [10, 10, 16, 24] или [25, 20, 15, 10]

        const sectorPercent = 100 / sectors.length
        let percent = 0
        let acc = 0

        for (const sector of sectors) {
            if ((acc + sector) <= value) {
                percent += sectorPercent
                acc += sector
            } else {
                percent += (sectorPercent * (value - acc)) / sector
                break
            }
        }

        return percent / 100
    }
}
