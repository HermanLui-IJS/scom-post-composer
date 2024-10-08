import {
    Module,
    Styles,
    Label,
    MarkdownEditor,
    Button,
    Panel,
    GridLayout,
    Image,
    HStack,
    customElements,
    ControlElement,
    Container,
    Modal,
    CardLayout,
    Input,
    Icon,
    VStack,
    Control,
    Switch, application, IPFS, StackLayout, IconName,
    Alert
} from '@ijstech/components';
import {IPost, IPostData} from '@scom/scom-post';
import {
    fetchReactionGifs,
    fetchGifs,
    fetchEmojis,
    emojiCategories,
    IEmojiCategory,
    colorsMapper,
    IEmoji,
    searchEmojis,
    extractWidgetUrl,
    getEmbedElement
} from './global/index';
import assets from './assets';
import {ScomPostComposerUpload, ScomPostComposerWidget} from './components/index';
import { widgetPreviewStyle, modalStyle } from './index.css';
import {ScomStorage} from '@scom/scom-storage';

const Theme = Styles.Theme.ThemeVars;

const PostAudience: IPostAudience[] = [
    {
        title: 'Public',
        icon: 'globe-americas',
        desc: 'Anyone on or off Nostr',
        value: 'public'
    },
    {
        title: 'Members',
        icon: 'user-friends',
        desc: 'Members of the community',
        value: 'members'
    }
]

type IReplyType = 'reply' | 'post' | 'quoted';
type onChangedCallback = (content: string) => void;
type onSubmitCallback = (content: string, medias: IPostData[]) => void;
type onPostAudienceChangedCallback = (value: string) => void;
type Action = {
    caption: string;
    icon?: {name: string, fill?: string;};
    tooltip?: string;
    onClick?: (e?: any) => void;
    hoveredColor?: string;
}

interface IPostAudience {
    title: string;
    icon: IconName;
    desc?: string;
    value: string;
}

interface IReplyInput {
    replyTo?: IPost;
    isReplyToShown?: boolean;
    type?: IReplyType;
    placeholder?: string;
    buttonCaption?: string;
    value?: string;
}

interface ScomPostComposerElement extends ControlElement {
    replyTo?: IPost;
    isReplyToShown?: boolean;
    type?: IReplyType;
    mobile?: boolean;
    placeholder?: string;
    buttonCaption?: string;
    onChanged?: onChangedCallback;
    onSubmit?: onSubmitCallback;
    onCancel?: () => void;
    focusedPost?: IPost;
    avatar?: string;
    autoFocus?: boolean;
    apiBaseUrl?: string;
    isPostAudienceShown?: boolean;
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            ['i-scom-post-composer']: ScomPostComposerElement;
        }
    }
}

@customElements('i-scom-post-composer')
export class ScomPostComposer extends Module {
    private pnlPostComposer: Panel;
    private mdEmoji: Modal;
    private mdGif: Modal;
    private mdPostAudience: Modal;
    private lbReplyTo: Label;
    private btnReply: Button;
    private btnPostAudience: Button;
    private pnlReplyTo: Panel;
    private gridReply: GridLayout;
    private imgReplier: Image;
    private pnlBorder: Panel;
    private pnlIcons: HStack;
    private gifCateLoading: Panel;
    private gridGif: CardLayout;
    private gridGifCate: CardLayout;
    private pnlGif: Panel;
    private pnlGifBack: Panel;
    private pnlGifClose: Panel;
    private inputGif: Input;
    private bottomElm: Panel;
    private gridEmojiCate: GridLayout;
    private groupEmojis: VStack;
    private pnlColors: Panel;
    private lbEmoji: Label;
    private pnlEmojiResult: VStack;
    private inputEmoji: Input;
    private gifLoading: VStack;
    private autoPlaySwitch: Switch;
    private pnlFocusedPost: Panel;
    // private pnlMedias: VStack;
    private selectedColor: Panel;
    private recent: Panel;
    private mdEditor: MarkdownEditor;
    private uploadForm: ScomPostComposerUpload;
    private iconMedia: Icon;
    private iconMediaMobile: Icon;
    private pnlActions: VStack;
    private mdPostActions: Modal;
    private storageEl: ScomStorage;
    private widgetModule: ScomPostComposerWidget;
    private mdAlert: Alert;

    private _focusedPost: IPost;
    private _data: IReplyInput;
    private currentGifPage: number = 0;
    private totalGifPage: number = 1;
    private renderedMap: { [key: number]: boolean } = {};
    private bottomObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            if (this.currentGifPage < this.totalGifPage) {
                ++this.currentGifPage;
                this.renderGifs(this.inputGif.value || '', this.autoPlaySwitch.checked);
            }
            // else {
            //   this.clearObservers();
            // }
        });
    }, {
        root: null,
        rootMargin: "20px",
        threshold: 0.9
    });
    private newReply: IPostData[] = [];
    private isEmojiSearching: boolean = false;
    private recentEmojis: { [key: string]: IEmoji } = {};
    private emojiCateMapper: Map<string, VStack> = new Map();
    private emojiGroupsData: Map<string, any> = new Map();
    private searchTimer: any;
    private mobile: boolean;
    private _avatar: string;
    private autoFocus: boolean;
    private currentPostData: any;
    private gifCateInitState = 0;
    private emojiInitState = 0;
    private _apiBaseUrl: string;
    private _isPostAudienceShown: boolean = false;
    private audience: IPostAudience = PostAudience[1];
    private manager: IPFS.FileManager;
    private _hasQuota = false;

    public onChanged: onChangedCallback;
    public onSubmit: onSubmitCallback;
    public onCancel: () => void;

    constructor(parent?: Container, options?: any) {
        super(parent, options);
        this.onRecentClear = this.onRecentClear.bind(this);
        this.onEmojiColorSelected = this.onEmojiColorSelected.bind(this);
        this.onUpload = this.onUpload.bind(this);
        this.onGifPlayChanged = this.onGifPlayChanged.bind(this);
        this.showStorage = this.showStorage.bind(this);
        this.onShowGifModal = this.onShowGifModal.bind(this);
        this.onShowWidgets = this.onShowWidgets.bind(this);
        this.onShowDeleteWidget = this.onShowDeleteWidget.bind(this);
    }

    static async create(options?: ScomPostComposerElement, parent?: Container) {
        let self = new this(parent, options);
        await self.ready();
        return self;
    }

    setFocus() {
        this.mdEditor.setFocus();
    }
    
    get hasQuota() {
        return this._hasQuota;
    }

    set hasQuota(value: boolean) {
        this._hasQuota = value;
    }

    get focusedPost() {
        return this._focusedPost;
    }

    set focusedPost(value) {
        this._focusedPost = value;
        this.updateFocusedPost();
    }

    get replyTo() {
        return this._data.replyTo;
    }

    set replyTo(value: IPost) {
        this._data.replyTo = value;
    }

    get type() {
        return this._data.type ?? 'reply';
    }

    set type(value: IReplyType) {
        this._data.type = value ?? 'reply';
    }

    get placeholder() {
        return this._data.placeholder ?? '';
    }

    set placeholder(value: string) {
        this._data.placeholder = value ?? '';
    }

    get buttonCaption() {
        return this._data.buttonCaption ?? '';
    }

    set buttonCaption(value: string) {
        this._data.buttonCaption = value ?? '';
    }

    get isReplyToShown(): boolean {
        return this._data.isReplyToShown ?? false;
    }

    set isReplyToShown(value: boolean) {
        this._data.isReplyToShown = value ?? false;
    }

    get apiBaseUrl() {
        return this._apiBaseUrl;
    }

    set apiBaseUrl(value: string) {
        this._apiBaseUrl = value;
    }

    get postAudience() {
        return this.audience?.value;
    }

    private get isQuote() {
        return this.type === 'quoted';
    }

    private get hasRecentEmojis() {
        return !!Object.values(this.recentEmojis).length;
    }

    private get emojiColors() {
        return Object.keys(colorsMapper);
    }

    private get currentEmojiColor() {
        return this.selectedColor?.background?.color || this.emojiColors[0];
    }

    get value() {
        return this._data.value;
    }

    set value(content: string) {
        this._data.value = content;
        this.mdEditor.value = content;
    }

    get avatar() {
        return this._avatar;
    }

    set avatar(value: string) {
        this._avatar = value || assets.fullPath('img/default_avatar.png');
        if (this.imgReplier) this.imgReplier.url = this._avatar;
    }

    get updatedValue() {
        return this.mdEditor.getMarkdownValue();
    }

    get isPostAudienceShown() {
        return this._isPostAudienceShown;
    }

    set isPostAudienceShown(value: boolean) {
        this._isPostAudienceShown = value;
        if (this.btnPostAudience) this.btnPostAudience.visible = value;
        if (!value && this.mdPostAudience?.visible) this.mdPostAudience.visible = false;
    }

    private removeShow(name: string) {
        if (this[name]) this[name].classList.remove('show');
    }

    private onShowModal2(target: Control, data: any, name: string) {
        this.currentPostData = data;
        if (this[name]) {
            this[name].parent = target;
            this[name].position = 'absolute';
            this[name].refresh();
            this[name].visible = true;
            this[name].classList.add('show');
        }
    }

    private isRecent(category: IEmojiCategory) {
        return category.value === 'recent';
    }

    setData(value: IReplyInput) {
        this.clear();
        this._data = value;
        this.lbReplyTo.caption = `${this.replyTo?.author?.internetIdentifier || ''}`;
        if (this.placeholder) this.mdEditor.placeholder = this.placeholder;
        if (this.buttonCaption) this.btnReply.caption = this.buttonCaption;
        this.updateGrid();
    }

    clear() {
        this.resetEditor();
        this.pnlReplyTo.visible = false;
        this.lbReplyTo.caption = '';
        this.pnlBorder.border = {
            top: {
                width: '1px',
                style: 'none',
                color: Theme.divider,
            }
        };
        this.currentGifPage = 1;
        this.totalGifPage = 1
        // this.pnlMedias.clearInnerHTML();
        this.emojiGroupsData = new Map();
    }

    private resetEditor() {
        if (this.mdEditor) {
            this.mdEditor.value = '';
        }
    }

    private clearObservers() {
        this.bottomElm.visible = false;
        this.bottomObserver.unobserve(this.bottomElm);
        this.renderedMap = {};
    }

    private updateGrid() {
        this.gridReply.templateColumns = ['2.75rem', 'minmax(auto, calc(100% - 3.5rem))'];
        if (this.isQuote) {
            this.gridReply.templateAreas = [
                ['avatar', 'editor'],
                ['avatar', 'quoted'],
                ['avatar', 'reply'],
            ];
            this.isReplyToShown = false;
            this.pnlReplyTo.visible = false;
        } else {
            if (this.isReplyToShown && !this.pnlReplyTo.visible) {
                this.gridReply.templateAreas = [['avatar', 'editor', 'reply']];
                this.gridReply.templateColumns = ['2.75rem', 'minmax(auto, 1fr)', '5.5rem'];
            } else {
                this.gridReply.templateAreas = [
                    ['avatar', 'editor'],
                    ['avatar', 'reply'],
                ];
            }
        }
        this.pnlReplyTo.visible = this.isReplyToShown;
    }

    private onEditorChanged() {
        if (this.pnlIcons && !this.pnlIcons.visible) this.pnlIcons.visible = true;
        this._data.value = this.updatedValue;
        this.btnReply.enabled = !!this._data.value;
        if (this.onChanged) this.onChanged(this._data.value);
    }

    private onReply() {
        if (this.onSubmit) {
            this._data.value = this.updatedValue;
            const extractedText = this._data.value.replace(/\$\$widget0\s+(.*?)\$\$/g, '$1');
            this.onSubmit(extractedText, [...this.newReply]);
        }
        this.resetEditor();
        // this.pnlMedias.clearInnerHTML();
    }

    private async onUpload() {
        // const result = application.uploadFile(this.extensions);
        if (!this.uploadForm) {
            this.uploadForm = await ScomPostComposerUpload.create({
                onConfirm: this.onSetImage.bind(this)
            });
        }
        this.uploadForm.openModal({
            title: 'Insert Image',
            width: 400,
        })
    }

    private updateFocusedPost() {
        if(this.pnlFocusedPost && this.mobile) {
            this.renderActions();
            const onProfileClicked = (target: Control, data: any, event: Event) => this.onShowModal2(target, data, 'mdPostActions');
            const focusedPost = <i-scom-post
                id={this.focusedPost.id}
                data={this.focusedPost}
                type="short"
                overflowEllipse={true}
                limitHeight={true}
                isReply={true}
                onProfileClicked={onProfileClicked}
                apiBaseUrl={this.apiBaseUrl}
            ></i-scom-post>;
            this.pnlFocusedPost.clearInnerHTML();
            this.pnlFocusedPost.append(focusedPost);
            // focusedPost.renderShowMore();
            // focusedPost.init();
        }
    }

    private onSetImage(url: string) {
        const imgMd = `\n![](${url})\n`;
        this.value = this.updatedValue + imgMd;
        if (!this.btnReply.enabled) this.btnReply.enabled = true;
        this.uploadForm.closeModal();
    }

    private onCloseModal(name: string) {
        this[name].visible = false;
    }

    private onShowModal(name: string) {
        this[name].refresh();
        this[name].visible = true;
    }

    private async onShowGifModal() {
        if (!this.gifCateInitState) {
            this.gifCateInitState = 1;
            this.renderGifCate();
        }
        this.onShowModal('mdGif');
    }

    private onGifMdOpen() {
        this.autoPlaySwitch.checked = true;
        this.onToggleMainGif(true);
    }

    private onGifMdClose() {
        this.clearObservers();
    }

    private async renderGifCate() {
        this.gridGifCate.clearInnerHTML();
        this.gifCateLoading.visible = true;
        const {data = []} = await fetchReactionGifs();
        const limitedList = [...data].slice(0, 8);
        this.gifCateLoading.visible = false;
        this.gridGifCate.visible = true;
        for (let cate of limitedList) {
            this.gridGifCate.appendChild(
                <i-panel
                    overflow={'hidden'}
                    onClick={() => this.onGifSearch(cate.name)}
                >
                    <i-image
                        url={cate.gif.images['480w_still'].url}
                        width={'100%'} display='block'
                    ></i-image>
                    <i-label
                        caption={cate.name}
                        font={{size: '1.25rem', weight: 700}}
                        position="absolute" bottom="0px"
                        display="block" width={'100%'}
                        padding={{left: '0.5rem', top: '0.5rem', right: '0.5rem', bottom: '0.5rem'}}
                    ></i-label>
                </i-panel>
            )
        }
    }

    private onGifSelected(gif: any) {
        this.onCloseModal('mdGif');
        const imgMd = `\n![${gif.images.fixed_height.url}](${gif.images.fixed_height_still.url})\n`;
        this.value = this.updatedValue + imgMd;
        if (!this.btnReply.enabled) this.btnReply.enabled = true;

        // let index = this.newReply.length;
        // const mediaWrap = <i-panel margin={{bottom: '0.5rem'}} overflow={'hidden'} opacity={0.7}>
        //   <i-image width={'100%'} height={'auto'} display="block" url={gif.images.original_still.url}></i-image>
        //   <i-icon
        //     name="times" width={'1.25rem'} height={'1.25rem'} fill={Theme.text.primary}
        //     border={{radius: '50%'}}
        //     padding={{top: 5, bottom: 5, left: 5, right: 5}}
        //     background={{color: 'rgba(15, 20, 25, 0.75)'}}
        //     position='absolute' right="10px" top="10px" zIndex={2}
        //     cursor="pointer"
        //     onClick={() => {
        //       mediaWrap.remove();
        //       this.newReply.splice(index, 1);
        //     }}
        //   ></i-icon>
        // </i-panel>;
        // mediaWrap.parent = this.pnlMedias;
        // this.pnlMedias.appendChild(mediaWrap);
        // const getPostData = (render: boolean) => {
        //   return {
        //     module: '@scom/scom-image',
        //     data: {
        //       "properties": {
        //         url: render ? gif.images.original_still.url : gif.images.original.url
        //       },
        //       "tag": {
        //         "width": "100%",
        //         "height": "auto",
        //         "pt": 0,
        //         "pb": 0,
        //         "pl": 0,
        //         "pr": 0
        //       }
        //     }
        //   }
        // }
        // this.newReply.push(getPostData(false));
    }

    private onGifSearch(q: string) {
        this.onToggleMainGif(false);
        this.inputGif.value = q;
        this.renderGifs(q, this.autoPlaySwitch.checked);
    }

    private onToggleMainGif(value: boolean) {
        this.gridGifCate.visible = value;
        this.pnlGif.visible = !value;
        this.currentGifPage = 1;
        this.totalGifPage = 1;
        if (value) {
            this.bottomObserver.unobserve(this.bottomElm);
            this.pnlGifBack.visible = false;
            this.pnlGifClose.visible = true;
        } else {
            this.bottomObserver.observe(this.bottomElm);
            this.pnlGifBack.visible = true;
            this.pnlGifClose.visible = false;
        }
        this.gridGif.clearInnerHTML();
        this.renderedMap = {};
        this.mdGif.refresh();
    }

    private async renderGifs(q: string, autoplay: boolean) {
        if (this.renderedMap[this.currentGifPage]) return;
        this.gifLoading.visible = true;
        this.renderedMap[this.currentGifPage] = true;
        const params = {q, offset: this.currentGifPage - 1};
        const {data = [], pagination: {total_count, count}} = await fetchGifs(params);
        this.totalGifPage = Math.ceil(total_count / count);
        this.bottomElm.visible = this.totalGifPage > 1;
        for (let gif of data) {
            this.gridGif.appendChild(
                <i-panel
                    onClick={() => this.onGifSelected(gif)}
                    width="100%"
                    overflow={'hidden'}
                >
                    <i-image
                        url={autoplay ? gif.images.fixed_height.url : gif.images.fixed_height_still.url}
                        width={'100%'} height='100%' objectFit='cover' display='block'
                    ></i-image>
                </i-panel>
            )
        }
        this.gifLoading.visible = false;
        this.mdGif.refresh();
    }

    private onGifPlayChanged(target: Switch) {
        this.renderGifs(this.inputGif.value, target.checked);
    }

    private onBack() {
        this.pnlGif.visible = false;
        this.gridGifCate.visible = true;
        this.pnlGifBack.visible = false;
        this.pnlGifClose.visible = true;
    }

    private onCloseGifModal() {
        this.onCloseModal('mdGif');
    }

    private async renderEmojis() {
        this.recentEmojis = {};
        this.emojiCateMapper = new Map();
        this.renderEmojiCate();
        this.renderColor(this.emojiColors[0]);
    }

    private async initEmojiGroup(category: IEmojiCategory) {
        if (this.isRecent(category) && !this.hasRecentEmojis) return;
        if (!this.emojiGroupsData.has(category.value)) {
            const list = await fetchEmojis({category: category.value});
            this.emojiGroupsData.set(category.value, JSON.parse(JSON.stringify(list)));
        }
        this.renderEmojiGroup(this.groupEmojis, category);
    }

    private async initEmojis() {
        for (let category of emojiCategories) {
            await this.initEmojiGroup(category);
        }
    }

    private async renderEmojiCate() {
        this.gridEmojiCate.clearInnerHTML();
        for (let category of emojiCategories) {
            const cateEl = (
                <i-vstack
                    id={`cate-${category.value}`}
                    overflow={'hidden'}
                    cursor='pointer'
                    opacity={0.5}
                    padding={{top: '0.25rem', bottom: '0.25rem'}}
                    horizontalAlignment="center"
                    position='relative'
                    class="emoji-cate"
                    gap={'0.5rem'}
                    onClick={(target: Control) => this.onEmojiCateSelected(target, category)}
                >
                    <i-image
                        url={category.image}
                        width={'1.25rem'} height={'1.25rem'} display='block'
                    ></i-image>
                    <i-hstack
                        visible={false}
                        border={{radius: '9999px'}}
                        height={'0.25rem'}
                        width={'100%'}
                        position='absolute' bottom="0px"
                        background={{color: Theme.colors.primary.main}}
                    ></i-hstack>
                </i-vstack>
            )
            this.gridEmojiCate.appendChild(cateEl);
            this.emojiCateMapper.set(`cate-${category.value}`, cateEl);
        }
    }

    private async renderEmojiGroup(parent: Control, category: IEmojiCategory) {
        const group = (
            <i-vstack
                id={`${category.value}`}
                border={{bottom: {width: '1px', style: 'solid', color: Theme.divider}}}
                gap="0.75rem"
                class="emoji-group"
            >
                <i-hstack
                    padding={{top: '0.75rem', left: '0.75rem', right: '0.75rem', bottom: '0.75rem'}}
                    position="sticky" top="0px" width={'100%'} zIndex={9}
                    background={{color: Theme.background.modal}}
                    verticalAlignment="center" horizontalAlignment="space-between"
                >
                    <i-label
                        caption={category.name}
                        font={{size: '1.063rem', weight: 700}}
                        wordBreak="break-word"
                    ></i-label>
                    <i-button
                        caption="Clear all"
                        font={{size: '0.9rem', weight: 700, color: Theme.colors.primary.main}}
                        cursor='pointer'
                        boxShadow='none'
                        padding={{left: '0.75rem', right: '0.75rem'}}
                        lineHeight={'1.25rem'}
                        border={{radius: '9999px'}}
                        background={{color: Theme.colors.info.light}}
                        visible={this.isRecent(category) && this.hasRecentEmojis}
                        onClick={this.onRecentClear}
                    ></i-button>
                </i-hstack>
            </i-vstack>
        )
        const itemWrap = <i-grid-layout id={`group-${category.value}`} columnsPerRow={9}
                                        padding={{left: '0.75rem', right: '0.75rem', bottom: '0.75rem'}}/>
        group.append(itemWrap);
        parent.appendChild(group);
        let data = [];
        if (this.isRecent(category)) {
            data = Object.values(this.recentEmojis);
        } else if (category.value === 'search') {
            const result = searchEmojis(this.inputEmoji.value, this.emojiGroupsData);
            data = this.filterGroups(result);
        } else {
            data = this.filterGroups(this.emojiGroupsData.get(category.value) || []);
        }
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            itemWrap.appendChild(
                <i-panel
                    width={'1.5rem'} height={'1.5rem'}
                    onClick={(target: Control, event: MouseEvent) => this.onEmojiSelected(event, item)}
                >
                    <i-label
                        caption={item.htmlCode.join('')}
                        display="inline-block"
                    ></i-label>
                </i-panel>
            )
        }
        if (this.isRecent(category)) {
            this.recent = group;
            parent.insertAdjacentElement('afterbegin', group);
        }
    }

    private updateEmojiGroups() {
        for (let i = 1; i < emojiCategories.length; i++) {
            const category = emojiCategories[i];
            const gridElm = this.groupEmojis.querySelector(`#group-${category.value}`) as Control;
            if (!gridElm) continue;
            gridElm.clearInnerHTML();
            const data = this.filterGroups(this.emojiGroupsData.get(category.value));
            for (let i = 0; i < data.length; i++) {
                const item = data[i];
                gridElm.appendChild(
                    <i-panel
                        width={'1.5rem'} height={'1.5rem'}
                        onClick={(target: Control, event: MouseEvent) => this.onEmojiSelected(event, item)}
                    >
                        <i-label
                            caption={item.htmlCode.join('')}
                            display="inline-block"
                        ></i-label>
                    </i-panel>
                )
            }
        }
    }

    private filterGroups(data: any[]) {
        const colorHtmlCode = colorsMapper[this.currentEmojiColor].htmlCode;
        return [...data].filter(item => {
            if (colorHtmlCode) {
                return item.htmlCode.includes(colorHtmlCode);
            } else {
                const itemLength = item.htmlCode?.length;
                return itemLength && itemLength !== 2;
            }
        })
    }

    private onRecentClear() {
        this.recentEmojis = {};
        if (this.recent) {
            this.recent.clearInnerHTML();
            this.recent = null;
        }
        if (this.gridEmojiCate?.children[1]) {
            this.onEmojiCateSelected(this.gridEmojiCate.children[1] as Control, emojiCategories[1]);
        }
    }

    private renderEmojiColors() {
        this.pnlColors.clearInnerHTML();
        for (let color of this.emojiColors) {
            this.renderColor(color);
        }
    }

    private renderActions() {
        const actions: Action[] = [
            {
                caption: 'Copy note link',
                icon: { name: 'copy' },
                tooltip: 'The link has been copied successfully',
                onClick: (e) => {
                    if(typeof this.currentPostData !== 'undefined') {
                        application.copyToClipboard(`${window.location.origin}/#!/e/${this.currentPostData.id}`)
                    }
                    this.mdPostActions.visible = false;
                }
            },
            {
                caption: 'Copy note text',
                icon: { name: 'copy' },
                tooltip: 'The text has been copied successfully',
                onClick: (e) => {
                    application.copyToClipboard(this.currentPostData['eventData']?.content)
                    this.mdPostActions.visible = false;
                }
            },
            {
                caption: 'Copy note ID',
                icon: { name: 'copy' },
                tooltip: 'The ID has been copied successfully',
                onClick: (e) => {
                    if(typeof this.currentPostData !== 'undefined') {
                        application.copyToClipboard(this.currentPostData.id)
                    }
                    this.mdPostActions.visible = false;
                }
            },
            {
                caption: 'Copy raw data',
                icon: { name: 'copy' },
                tooltip: 'The raw data has been copied successfully',
                onClick: (e) => {
                    if(typeof this.currentPostData !== 'undefined') {
                        application.copyToClipboard(JSON.stringify(this.currentPostData['eventData']))
                    }
                    this.mdPostActions.visible = false;

                }
            },
            // {
            //     caption: 'Broadcast note',
            //     icon: { name: "broadcast-tower" }
            // },
            {
                caption: 'Copy user public key',
                icon: { name: 'copy' },
                tooltip: 'The public key has been copied successfully',
                onClick: (e) => {
                    if(typeof this.currentPostData !== 'undefined') {
                        application.copyToClipboard(this.currentPostData.author.npub || '')
                    }
                    this.mdPostActions.visible = false;
                }
            },
            // {
            //     caption: 'Mute user',
            //     icon: { name: "user-slash", fill: Theme.colors.error.main },
            //     hoveredColor: 'color-mix(in srgb, var(--colors-error-main) 25%, var(--background-paper))'
            // },
            // {
            //     caption: 'Report user',
            //     icon: { name: "exclamation-circle", fill: Theme.colors.error.main },
            //     hoveredColor: 'color-mix(in srgb, var(--colors-error-main) 25%, var(--background-paper))'
            // }
        ]
        this.pnlActions.clearInnerHTML();
        for (let i = 0; i < actions.length; i++) {
            const item: any = actions[i];
            this.pnlActions.appendChild(
                <i-hstack
                    horizontalAlignment="space-between"
                    verticalAlignment="center"
                    width="100%"
                    padding={{top: '0.625rem', bottom: '0.625rem', left: '0.75rem', right: '0.75rem'}}
                    background={{color: 'transparent'}}
                    border={{radius: '0.5rem'}}
                    opacity={item.hoveredColor ? 1 : 0.667}
                    hover={{
                        backgroundColor: item.hoveredColor || Theme.action.hoverBackground,
                        opacity: 1
                    }}
                    onClick={item.onClick?.bind(this)}
                >
                    <i-label
                        caption={item.caption}
                        font={{color: item.icon?.fill || Theme.text.primary, weight: 400, size: '0.875rem'}}
                    ></i-label>
                    <i-icon
                        name={item.icon.name}
                        width='0.75rem' height='0.75rem'
                        display='inline-flex'
                        fill={item.icon?.fill || Theme.text.primary}
                    ></i-icon>
                </i-hstack>
            )
        }
        this.pnlActions.appendChild(
            <i-hstack
                width="100%"
                horizontalAlignment="center"
                padding={{top: 12, bottom: 12, left: 16, right: 16}}
                visible={false}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: { visible: true }
                    }
                ]}
            >
                <i-button
                    caption='Cancel'
                    width="100%" minHeight={44}
                    padding={{left: 16, right: 16}}
                    font={{color: Theme.text.primary, weight: 600}}
                    border={{radius: '30px', width: '1px', style: 'solid', color: Theme.colors.secondary.light}}
                    grid={{horizontalAlignment: 'center'}}
                    background={{color: 'transparent'}}
                    boxShadow="none"
                    onClick={() => this.onCloseModal('mdPostActions')}
                ></i-button>
            </i-hstack>
        )
    }

    private renderColor(color: string) {
        const isCurrentColor = color === this.currentEmojiColor;
        const colorEl = (
            <i-panel
                background={{color}}
                border={{radius: '50%'}}
                width={'1.188rem'} height={'1.188rem'}
                padding={{left: '0.35rem'}}
                stack={{grow: '0', shrink: '0', basis: '1.188rem'}}
                boxShadow={`${isCurrentColor ? 'rgb(29, 155, 240) 0px 0px 0px 2px' : 'none'}`}
                onClick={this.onEmojiColorSelected}
            >
                <i-icon
                    name='check' width={'0.5rem'} height={'0.5rem'}
                    lineHeight={'0.35rem'}
                    fill={'rgb(21, 32, 43)'} visible={isCurrentColor}
                ></i-icon>
            </i-panel>
        )
        if (isCurrentColor) this.selectedColor = colorEl;
        this.pnlColors.appendChild(colorEl);
    }

    private onEmojiColorSelected(target: Control) {
        if (!this.pnlColors?.children || this.pnlColors?.children?.length < 2) {
            this.renderEmojiColors();
            return;
        }
        if (this.selectedColor) {
            this.selectedColor.boxShadow = 'none';
            const icon = this.selectedColor.querySelector('i-icon') as Icon;
            if (icon) icon.visible = false;
        }
        target.boxShadow = 'rgb(29, 155, 240) 0px 0px 0px 2px';
        const icon = target.querySelector('i-icon') as Icon;
        if (icon) icon.visible = true;
        this.selectedColor = target as Panel;
        this.updateEmojiGroups();
    }

    private onEmojiCateSelected(target: Control, category: IEmojiCategory) {
        if (!target) return;
        const preventSelected = this.isEmojiSearching || (this.isRecent(category) && !this.recent?.children[1]?.innerHTML);
        if (preventSelected) return;
        const cates = this.querySelectorAll('.emoji-cate');
        for (let cateEl of cates) {
            (cateEl as Control).opacity = 0.5;
            (cateEl.children[1] as Control).visible = false;
        }
        (target.children[1] as Control).visible = true;
        target.opacity = 1;
        if (this.isRecent(category)) {
            this.groupEmojis.scrollTo({top: 0});
        } else {
            const groupEl = this.querySelector(`#${category.value}`) as Control;
            if (groupEl) {
                this.groupEmojis.scrollTo({top: groupEl.offsetTop});
            }
        }
    }

    private async onEmojiSelected(event: MouseEvent, emoji: IEmoji) {
        event.stopImmediatePropagation();
        event.preventDefault();
        this.lbEmoji.caption = `${emoji.htmlCode.join('')}`;
        const newSpan = document.createElement('span');
        newSpan.innerHTML = `<span style='font-size:1.25rem;'>${emoji.htmlCode.join('')}</span>`;
        this.value = this.updatedValue + '\n' + newSpan.innerHTML;

        this.recentEmojis[emoji.name] = emoji;
        const parent = (event.target as Control).closest('.emoji-group') as Control;
        if (parent) {
            this.groupEmojis.scrollTo({top: parent.offsetTop + event.clientY});
        }
    }

    private async onEmojiSearch() {
        if (this.searchTimer) clearTimeout(this.searchTimer);
        if (!this.inputEmoji.value) {
            this.pnlEmojiResult.visible = false;
            this.groupEmojis.visible = true;
            this.lbEmoji.caption = '';
            this.isEmojiSearching = false;
            this.mdEmoji.refresh();
        } else {
            this.pnlEmojiResult.visible = true;
            this.groupEmojis.visible = false;
            this.pnlEmojiResult.clearInnerHTML();
            this.searchTimer = setTimeout(() => {
                const category = {
                    name: 'Search results',
                    value: 'search'
                }
                this.renderEmojiGroup(this.pnlEmojiResult, category);
                this.mdEmoji.refresh();
            }, 100)
            this.isEmojiSearching = true;
        }
    }

    private onEmojiMdOpen() {
        this.pnlEmojiResult.visible = false;
        this.groupEmojis.visible = true;
        this.inputEmoji.value = '';
        this.lbEmoji.caption = '';
        this.isEmojiSearching = false;
        if (!this.emojiInitState) {
            this.emojiInitState = 1;
            this.initEmojis();
        } else {
            if (this.hasRecentEmojis) {
                const recent = this.groupEmojis.querySelector('#recent');
                recent && this.groupEmojis.removeChild(recent);
                this.renderEmojiGroup(this.groupEmojis, emojiCategories[0]);
            } else {
                this.recent && this.recent.clearInnerHTML();
            }
            const index = this.hasRecentEmojis ? 0 : 1;
            if (this.gridEmojiCate?.children?.length) {
                this.onEmojiCateSelected(this.gridEmojiCate.children[index] as Control, emojiCategories[index]);
            }
            this.pnlColors.clearInnerHTML();
            this.renderColor(this.currentEmojiColor);
            this.mdEmoji.refresh();
        }
    }

    private showStorage() {
        if (!this.hasQuota) {
            this.onUpload();
            return;
        }
        if (!this.storageEl) {
            this.storageEl = ScomStorage.getInstance();
            this.storageEl.onCancel = () => this.storageEl.closeModal();
        }
        this.storageEl.uploadMultiple = false;
        this.storageEl.onUploadedFile = (path: string) => {
            this.storageEl.closeModal();
            const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg'];
            const ext = path.split('.').pop();
            if (imageTypes.includes(ext)) {
                this.mdEditor.value = this.updatedValue + '\n\n' + `![${path.split('/').pop()}](<${path}>)` + '\n\n';
            } else {
                const linkMd = `[${path}](<${path}>)`;
                this.mdEditor.value = this.updatedValue + '\n\n' + linkMd + '\n\n';
            }
        }
        this.storageEl.onOpen = (path: string) => {
            this.storageEl.closeModal();
            const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg'];
            const ext = path.split('.').pop();
            if (imageTypes.includes(ext)) {
                this.mdEditor.value = this.updatedValue + '\n\n' + `![${path.split('/').pop()}](<${path}>)` + '\n\n';
            } else {
                const linkMd = `[${path}](<${path}>)`;
                this.mdEditor.value = this.updatedValue + '\n\n' + linkMd + '\n\n';
            }
        }
        this.storageEl.openModal({
            width: 800,
            maxWidth: '100%',
            height: '90vh',
            overflow: 'hidden',
            zIndex: 1000,
            closeIcon: {width: '1rem', height: '1rem', name: 'times', fill: Theme.text.primary, margin: {bottom: '0.5rem'}},
            class: modalStyle
        })
        this.storageEl.onShow();
    }

    private async onShowWidgets(widget?: { widgetUrl: string, icon: Icon }) {
        if (!this.widgetModule) {
            this.widgetModule = await ScomPostComposerWidget.create({
                onConfirm: (url: string) => {
                    if (url)
                        this.mdEditor.value = this.updatedValue + '\n\n' + url + '\n\n';
                    this.widgetModule.closeModal();
                },
                onUpdate: (oldUrl: string, newUrl: string) => {
                    if (newUrl) {
                        this.mdEditor.value = this.updatedValue.replace(`$$widget0 ${oldUrl}$$`, newUrl);
                    }
                    this.widgetModule.closeModal();
                },
                onCloseButtonClick: () => {
                    this.widgetModule.closeModal();
                }
            });
        }
        const modal = this.widgetModule.openModal({
            width: '90%',
            maxWidth: '50rem',
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            closeOnBackdropClick: true,
            closeIcon: null
        });
        this.widgetModule.onRefresh = (maxWidth: string) => {
            modal.maxWidth = maxWidth;
            const wrapper: HTMLElement = modal.querySelector('.modal');
            if (wrapper) wrapper.style.maxWidth = maxWidth;
            modal.refresh();
        }
        if (widget) {
            const { icon, widgetUrl } = widget;
            this.widgetModule.onUpdate = (oldUrl: string, newUrl: string) => {
                if (newUrl) {
                    const editor = icon.closest('i-markdown-editor#mdEditor') as MarkdownEditor;
                    if (!editor) return;
                    const value = editor.getMarkdownValue();
                    editor.value = value.replace(`$$widget0 ${oldUrl}$$`, newUrl);
                }
                this.widgetModule.closeModal();
            }
            this.widgetModule.show(widgetUrl);
        } else {
            this.widgetModule.show();
        }
    }

    private onShowDeleteWidget(widget: string, icon: Icon) {
        const editor = icon.closest('i-markdown-editor#mdEditor') as MarkdownEditor;
        if (!editor) return;
        const alert = editor.closest('i-scom-post-composer')?.querySelector('i-alert') as Alert;
        if (!alert) {
            const value = editor.getMarkdownValue();
            editor.value = value.replace(`$$widget0 ${widget}$$`, '');
        } else {
            alert.onConfirm = () => {
                const value = editor.getMarkdownValue();
                editor.value = value.replace(`$$widget0 ${widget}$$`, '');
            }
            alert.showModal();
        }
    }

    private renderWidget(url: string) {
        let widgetData = extractWidgetUrl(url);
        const pnl = new Panel(undefined, { width: '100%' });
        pnl.classList.add(widgetPreviewStyle);
        const hStack = new HStack(pnl, {
            width: '100%',
            gap: '0.75rem',
            verticalAlignment: 'center',
            horizontalAlignment: 'end',
            margin: { bottom: '0.5rem'},
            padding: { left: '0.75rem', right: '0.75rem' }
        });
        const iconConfig = new Icon(hStack, {
            name: 'cog',
            fill: Theme.text.primary,
            width: '1rem',
            height: '1rem',
            cursor: 'pointer',
            tooltip: { content: 'Config' }
        });
        iconConfig.onClick = () => { this.onShowWidgets({ widgetUrl: url, icon: iconConfig }) };

        const iconDelete = new Icon(hStack, {
            name: 'trash',
            fill: '#e45a5a',
            width: '1rem',
            height: '1rem',
            cursor: 'pointer',
            tooltip: { content: 'Delete' }
        });
        iconDelete.onClick = () => { this.onShowDeleteWidget(url, iconDelete) };

        getEmbedElement({
            module: widgetData.moduleName,
            data: {
                properties: {
                    ...widgetData.data
                },
                tag: {
                    width: '100%'
                }
            }
        }, pnl);
        return pnl;
    }

    protected _handleClick(event: MouseEvent, stopPropagation?: boolean): boolean {
        this.pnlIcons.visible = true;
        if (this.isReplyToShown) {
            this.pnlReplyTo.visible = true;
            this.updateGrid();
        }
        return true;
    }

    private showPostAudienceModal() {
        this.onShowModal('mdPostAudience');
    }

    init() {
        super.init();
        this.onChanged = this.getAttribute('onChanged', true) || this.onChanged;
        this.onSubmit = this.getAttribute('onSubmit', true) || this.onSubmit;
        this.onCancel = this.getAttribute('onCancel', true) || this.onCancel;

        const apiBaseUrl = this.getAttribute('apiBaseUrl', true);
        if (apiBaseUrl) this.apiBaseUrl = apiBaseUrl;
        const replyTo = this.getAttribute('replyTo', true);
        const type = this.getAttribute('type', true, 'reply');
        const isReplyToShown = this.getAttribute('isReplyToShown', true, false);
        const placeholder = this.getAttribute('placeholder', true);
        const buttonCaption = this.getAttribute('buttonCaption', true);
        this.autoFocus = this.getAttribute('autoFocus', true);
        this.focusedPost = this.getAttribute('focusedPost', true);
        const mobile = this.getAttribute('mobile', true);
        this.mobile = mobile;
        this.avatar = this.getAttribute('avatar', true);
        const isPostAudienceShown = this.getAttribute('isPostAudienceShown', true);
        if (isPostAudienceShown != null) {
            this._isPostAudienceShown = isPostAudienceShown;
        }
        if (mobile) {
            this.renderMobilePostComposer();
        } else {
            this.renderPostComposer();
        }
        this.setData({isReplyToShown, replyTo, type, placeholder, buttonCaption});
        this.renderEmojis();
        // if(this.autoFocus) {
        this.mdEditor.autoFocus = this.autoFocus;
        if(this.autoFocus)
            this.mdEditor.setFocus();
        // }
        // this.updateFocusedPost();

        const self = this;
        this.mdEditor.widgetRules = [
            {
                rule: /https?:\/\/widget\.\S+\/scom\/\S+\/\S+/g,
                toDOM(text) {
                    try {
                        const widget = self.renderWidget(text);
                        return widget;
                    } catch {
                        return text;
                    }
                },
            },
        ]
    }

    private async handleMobileCloseComposer() {
        if (this.onCancel)
            await this.onCancel();
    }

    private handlePostAudienceClick(audience: IPostAudience) {
        this.audience = audience;
        this.btnPostAudience.caption = audience.title;
        this.btnPostAudience.icon.name = audience.icon;
        this.onCloseModal('mdPostAudience')
    }

    private renderPostAudiences() {
        const panel: StackLayout = <i-stack direction="vertical"></i-stack>;
        for (let audience of PostAudience) {
            panel.appendChild(
                <i-stack
                    direction="horizontal"
                    alignItems="center"
                    width="100%"
                    padding={{ top: '0.75rem', bottom: '0.75rem', left: '1rem', right: '1rem' }}
                    background={{ color: 'transparent' }}
                    border={{ radius: '0.125rem' }}
                    gap="0.75rem"
                    cursor="pointer"
                    hover={{
                        fontColor: Theme.text.primary,
                        backgroundColor: Theme.action.hoverBackground
                    }}
                    onClick={() => this.handlePostAudienceClick(audience)}
                >
                    <i-icon
                        name={audience.icon}
                        width={'0.75rem'} height={'0.75rem'}
                        display='inline-flex'
                        fill={Theme.text.primary}
                    ></i-icon>
                    <i-stack direction="vertical" height="100%" minWidth={0} justifyContent="space-between" lineHeight="1.125rem">
                        <i-label
                            caption={audience.title || ""}
                            font={{ size: '0.9375rem', weight: 700 }}
                            textOverflow="ellipsis"
                            overflow="hidden"
                        ></i-label>
                        <i-label
                            caption={audience.desc || ""}
                            font={{ size: '0.75rem', weight: 400, color: Theme.text.secondary }}
                            lineHeight={'1rem'}
                            textOverflow="ellipsis"
                            overflow="hidden"
                        ></i-label>
                    </i-stack>
                </i-stack>
            )
        }
        return panel;
    }

    private renderMobilePostComposer() {
        const pnlPostAudiences = this.renderPostAudiences();
        const elm = <i-panel cursor='default'>
            <i-hstack
                justifyContent={'space-between'}
                alignItems={'center'}
                padding={{left: '0.5rem', right: '0.5rem'}}
                position={'fixed'}
                top={0}
                zIndex={10}
                background={{color: '#000'}}
                width={'100%'}
                border={{bottom: {width: '.5px', style: 'solid', color: Theme.divider}}}
                height={50}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            border: { bottom: { style: 'none' }}
                        }
                    }
                ]}
            >
                <i-button caption={"Cancel"} onClick={this.handleMobileCloseComposer.bind(this)}
                          padding={{left: 5, right: 5, top: 5, bottom: 5}} font={{size: Theme.typography.fontSize}}
                          background={{color: 'transparent'}}/>
                <i-button id={"btnReply"}
                          caption={"Post"}
                          enabled={false}
                          onClick={this.onReply.bind(this)}
                          padding={{left: '1rem', right: '1rem'}}
                          height={36}
                          background={{color: Theme.colors.primary.main}}
                          font={{size: Theme.typography.fontSize, color: Theme.colors.primary.contrastText, bold: true}}
                          border={{radius: '30px'}}/>
            </i-hstack>
            <i-hstack
                id="pnlReplyTo"
                visible={false}
                gap="0.5rem"
                verticalAlignment="center"
                padding={{top: '0.25rem', bottom: '0.75rem', left: '3.25rem'}}
            >
                <i-label
                    caption="Replying to"
                    font={{size: '1rem', color: Theme.text.secondary}}
                ></i-label>
                <i-label
                    id="lbReplyTo"
                    link={{href: ''}}
                    font={{size: '1rem', color: Theme.colors.primary.main}}
                ></i-label>
            </i-hstack>
            <i-panel id={'pnlFocusedPost'} padding={{top: 50}}>

            </i-panel>
            <i-grid-layout
                id="gridReply"
                gap={{column: '0.75rem'}}
                height={""}
                templateColumns={['2.75rem', 'minmax(auto, calc(100% - 3.5rem))']}
                templateRows={['auto']}
                templateAreas={[
                    ['avatar', 'editor'],
                    ['avatar', 'reply']
                ]}
                padding={{left: '0.75rem'}}
            >
                <i-image
                    id="imgReplier"
                    grid={{area: 'avatar'}}
                    width={'2.75rem'}
                    height={'2.75rem'}
                    display="block"
                    background={{color: Theme.background.main}}
                    border={{radius: '50%'}}
                    overflow={'hidden'}
                    margin={{top: '0.75rem'}}
                    objectFit='cover'
                    url={this._avatar}
                    fallbackUrl={assets.fullPath('img/default_avatar.png')}
                ></i-image>
                <i-panel
                    grid={{area: 'editor'}}
                    maxHeight={'45rem'}
                    overflow={{x: 'hidden', y: 'auto'}}
                >
                    <i-markdown-editor
                        id="mdEditor"
                        width="100%"
                        viewer={false}
                        hideModeSwitch={true}
                        mode="wysiwyg"
                        toolbarItems={[]}
                        font={{size: '1.25rem', color: Theme.text.primary}}
                        lineHeight={1.5}
                        padding={{top: 12, bottom: 12, left: 0, right: 0}}
                        background={{color: 'transparent'}}
                        height="auto"
                        minHeight={0}
                        overflow={'hidden'}
                        overflowWrap="break-word"
                        onChanged={this.onEditorChanged.bind(this)}
                        cursor='text'
                        border={{style: 'none'}}
                        visible={true}
                    ></i-markdown-editor>
                    {/* <i-vstack id="pnlMedias" /> */}
                </i-panel>

                {/* comment */}
                <i-hstack
                    id="pnlBorder"
                    horizontalAlignment="space-between"
                    grid={{area: 'reply'}}
                    padding={{top: '0.625rem', right: '0.5rem'}}
                >
                    <i-hstack
                        id="pnlIcons"
                        gap="4px" verticalAlignment="center"
                        visible={false}
                    >
                        <i-icon
                            id="iconMediaMobile"
                            name="image" width={28} height={28} fill={Theme.colors.primary.main}
                            border={{radius: '50%'}}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'Media', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={this.showStorage}
                        ></i-icon>
                        <i-icon
                            name="images" width={28} height={28} fill={Theme.colors.primary.main}
                            border={{radius: '50%'}}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'GIF', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={this.onShowGifModal}
                        ></i-icon>
                        <i-panel>
                            <i-icon
                                name="smile" width={28} height={28} fill={Theme.colors.primary.main}
                                border={{radius: '50%'}}
                                padding={{top: 5, bottom: 5, left: 5, right: 5}}
                                tooltip={{content: 'Emoji', placement: 'bottom'}}
                                cursor="pointer"
                                onClick={() => this.onShowModal('mdEmoji')}
                            ></i-icon>
                            <i-modal
                                id="mdEmoji"
                                maxWidth={'100%'}
                                minWidth={320}
                                popupPlacement='bottomRight'
                                showBackdrop={false}
                                border={{radius: '1rem'}}
                                boxShadow='rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px'
                                padding={{top: 0, left: 0, right: 0, bottom: 0}}
                                closeOnScrollChildFixed={true}
                                onOpen={this.onEmojiMdOpen.bind(this)}
                                visible={false}
                            >
                                <i-vstack position='relative' padding={{left: '0.25rem', right: '0.25rem'}}>
                                    <i-hstack
                                        verticalAlignment="center"
                                        border={{radius: '9999px', width: '1px', style: 'solid', color: Theme.divider}}
                                        minHeight={40} width={'100%'}
                                        background={{color: Theme.input.background}}
                                        padding={{left: '0.75rem', right: '0.75rem'}}
                                        margin={{top: '0.25rem', bottom: '0.25rem'}}
                                        gap="4px"
                                    >
                                        <i-icon width={'1rem'} height={'1rem'} name='search'
                                                fill={Theme.text.secondary}/>
                                        <i-input
                                            id="inputEmoji"
                                            placeholder='Search Emojis'
                                            width='100%'
                                            height='100%'
                                            border={{style: 'none'}}
                                            captionWidth={'0px'}
                                            showClearButton={true}
                                            onClearClick={this.onEmojiMdOpen.bind(this)}
                                            onKeyUp={this.onEmojiSearch.bind(this)}
                                        ></i-input>
                                    </i-hstack>
                                    <i-grid-layout
                                        id="gridEmojiCate"
                                        verticalAlignment="center"
                                        columnsPerRow={9}
                                        margin={{top: 4}}
                                        grid={{verticalAlignment: 'center', horizontalAlignment: 'center'}}
                                        border={{bottom: {width: '1px', style: 'solid', color: Theme.divider}}}
                                    ></i-grid-layout>
                                    <i-vstack id="groupEmojis" maxHeight={400} overflow={{y: 'auto'}}/>
                                    <i-vstack
                                        id="pnlEmojiResult"
                                        border={{bottom: {width: '1px', style: 'solid', color: Theme.divider}}}
                                        maxHeight={400} overflow={{y: 'auto'}}
                                        minHeight={200}
                                        gap="0.75rem"
                                        visible={false}
                                    />
                                    <i-hstack
                                        bottom="0px" left="0px" position="absolute" width={'100%'}
                                        verticalAlignment="center" horizontalAlignment="space-between"
                                        padding={{top: '0.75rem', left: '0.75rem', right: '0.75rem', bottom: '0.75rem'}}
                                        gap="0.75rem" zIndex={20}
                                        background={{color: Theme.background.modal}}
                                        border={{
                                            radius: '0 0 1rem 1rem',
                                            top: {width: '1px', style: 'solid', color: Theme.divider}
                                        }}
                                    >
                                        <i-label id="lbEmoji" width={'1.25rem'} height={'1.25rem'}
                                                 display="inline-block"></i-label>
                                        <i-hstack
                                            id="pnlColors"
                                            verticalAlignment="center" gap={'0.25rem'}
                                            overflow={'hidden'}
                                            cursor="pointer"
                                            padding={{
                                                top: '0.25rem',
                                                left: '0.25rem',
                                                right: '0.25rem',
                                                bottom: '0.25rem'
                                            }}
                                        />
                                    </i-hstack>
                                </i-vstack>
                            </i-modal>
                        </i-panel>
                        <i-icon
                            width={28}
                            height={28}
                            name="shapes"
                            fill={Theme.colors.primary.main}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'Widgets', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={() => this.onShowWidgets()}
                        ></i-icon>
                    </i-hstack>
                    <i-panel>
                        <i-button
                            id="btnPostAudience"
                            height={32}
                            padding={{left: '1rem', right: '1rem'}}
                            background={{color: Theme.colors.secondary.main}}
                            font={{color: Theme.colors.secondary.contrastText, bold: true}}
                            border={{radius: '0.375rem'}}
                            caption={this.audience.title}
                            icon={{ width: 14, height: 14, name: this.audience.icon, fill: Theme.colors.secondary.contrastText }}
                            rightIcon={{ width: 14, height: 14, name: 'angle-down', fill: Theme.colors.secondary.contrastText }}
                            visible={this.isPostAudienceShown}
                            onClick={this.showPostAudienceModal.bind(this)}
                        ></i-button>
                        <i-modal
                            id="mdPostAudience"
                            maxWidth={'15rem'}
                            minWidth={'12.25rem'}
                            maxHeight={'27.5rem'}
                            popupPlacement='bottomRight'
                            showBackdrop={false}
                            border={{ radius: '0.5rem' }}
                            boxShadow="rgba(255, 255, 255, 0.2) 0px 0px 15px, rgba(255, 255, 255, 0.15) 0px 0px 3px 1px"
                            padding={{ top: 0, bottom: 0, left: 0, right: 0 }}
                            overflow={{ y: 'hidden' }}
                            visible={false}
                        >
                            {pnlPostAudiences}
                        </i-modal>
                    </i-panel>
                </i-hstack>
            </i-grid-layout>

            <i-modal
                id="mdPostActions"
                visible={false}
                maxWidth={'15rem'}
                minWidth={'12.25rem'}
                popupPlacement='bottomRight'
                showBackdrop={false}
                border={{radius: '0.25rem', width: '1px', style: 'solid', color: Theme.divider}}
                padding={{top: '0.5rem', left: '0.5rem', right: '0.5rem', bottom: '0.5rem'}}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            showBackdrop: true,
                            popupPlacement: 'bottom',
                            position: 'fixed',
                            zIndex: 999,
                            maxWidth: '100%',
                            width: '100%',
                            maxHeight: '50vh',
                            overflow: {y: 'auto'},
                            border: {radius: '16px 16px 0 0'}
                        }
                    }
                ]}
                onClose={() => this.removeShow('mdPostActions')}
            >
                <i-vstack id="pnlActions" minWidth={0} maxHeight={'27.5rem'} overflow={{y: 'auto'}}/>
            </i-modal>

            <i-modal
                id="mdGif"
                border={{radius: '1rem'}}
                maxWidth={'600px'}
                maxHeight={'90vh'}
                overflow={{y: 'auto'}}
                padding={{top: 0, right: 0, left: 0, bottom: 0}}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            showBackdrop: true,
                            popupPlacement: 'top',
                            position: 'fixed',
                            zIndex: 999,
                            maxWidth: '100%',
                            height: '100%',
                            width: '100%',
                            border: {radius: 0}
                        }
                    }
                ]}
                onOpen={this.onGifMdOpen.bind(this)}
                onClose={this.onGifMdClose.bind(this)}
            >
                <i-vstack>
                    <i-hstack
                        verticalAlignment="center"
                        height={53}
                        margin={{top: 8, bottom: 8}}
                        padding={{right: '0.5rem', left: '0.5rem'}}
                        position="sticky"
                        zIndex={2} top={'0px'}
                        background={{color: Theme.background.modal}}
                    >
                        <i-panel
                            id="pnlGifBack"
                            padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.5rem', right: '0.5rem' }}
                            cursor='pointer'
                            onClick={this.onBack.bind(this)}
                            visible={false}
                        >
                            <i-icon
                                name="arrow-left"
                                width={20} height={20} fill={Theme.colors.secondary.main}
                            ></i-icon>
                        </i-panel>
                        <i-hstack
                            verticalAlignment="center"
                            padding={{left: '0.75rem', right: '0.75rem'}}
                            border={{radius: '9999px', width: '1px', style: 'solid', color: Theme.divider}}
                            minHeight={40} width={'100%'}
                            background={{color: Theme.input.background}}
                            gap="4px"
                        >
                            <i-icon width={16} height={16} name='search' fill={Theme.text.secondary}/>
                            <i-input
                                id="inputGif"
                                placeholder='Search for GIFs'
                                width='100%'
                                height='100%'
                                captionWidth={'0px'}
                                border={{style: 'none'}}
                                showClearButton={true}
                                onClearClick={() => this.onToggleMainGif(true)}
                                onKeyUp={(target: Input) => this.onGifSearch(target.value)}
                            ></i-input>
                        </i-hstack>
                        <i-panel
                            id="pnlGifClose"
                            padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.5rem', right: '0.5rem' }}
                            cursor='pointer'
                            onClick={this.onCloseGifModal.bind(this)}
                        >
                            <i-icon
                                name="times"
                                width={20} height={20} fill={Theme.colors.secondary.main}
                            ></i-icon>
                        </i-panel>
                    </i-hstack>
                    <i-panel id="gifCateLoading" height={600}>
                        <i-stack
                            direction="vertical"
                            height="100%" width="100%"
                            class="i-loading-overlay"
                            background={{color: Theme.background.modal}}
                        >
                            <i-stack direction="vertical" class="i-loading-spinner" alignItems="center" justifyContent="center">
                                <i-icon
                                    class="i-loading-spinner_icon"
                                    name="spinner"
                                    width={24}
                                    height={24}
                                    fill={Theme.colors.primary.main}
                                />
                            </i-stack>
                        </i-stack>
                    </i-panel>
                    <i-card-layout
                        id="gridGifCate"
                        cardMinWidth={'18rem'}
                        cardHeight={'9.375rem'}
                        visible={false}
                    ></i-card-layout>
                    <i-vstack id="pnlGif" visible={false}>
                        <i-hstack
                            horizontalAlignment="space-between"
                            gap="0.5rem"
                            padding={{left: '0.75rem', right: '0.75rem', top: '0.75rem', bottom: '0.75rem'}}
                        >
                            <i-label caption="Auto-play GIFs"
                                     font={{color: Theme.text.secondary, size: '0.9rem'}}></i-label>
                            <i-switch
                                id="autoPlaySwitch"
                                checked={true}
                                uncheckedTrackColor={Theme.divider}
                                checkedTrackColor={Theme.colors.primary.main}
                                onChanged={this.onGifPlayChanged.bind(this)}
                            ></i-switch>
                        </i-hstack>
                        <i-panel id="topElm" width={'100%'}></i-panel>
                        <i-card-layout
                            id="gridGif"
                            autoRowSize="auto"
                            autoColumnSize="auto"
                            cardHeight={'auto'}
                            columnsPerRow={4}
                        ></i-card-layout>
                        <i-panel id="bottomElm" width={'100%'} minHeight={20}>
                            <i-vstack
                                id="gifLoading"
                                padding={{top: '0.5rem', bottom: '0.5rem'}}
                                visible={false}
                                height="100%" width="100%"
                                class="i-loading-overlay"
                                background={{color: Theme.background.modal}}
                            >
                                <i-vstack class="i-loading-spinner" horizontalAlignment="center"
                                          verticalAlignment="center">
                                    <i-icon
                                        class="i-loading-spinner_icon"
                                        name="spinner"
                                        width={24}
                                        height={24}
                                        fill={Theme.colors.primary.main}
                                    />
                                </i-vstack>
                            </i-vstack>
                        </i-panel>
                    </i-vstack>
                </i-vstack>
            </i-modal>

            <i-modal
                id="mdWidgets"
                border={{radius: '1rem'}}
                maxWidth={'600px'}
                maxHeight={'90vh'}
                overflow={{y: 'auto'}}
                padding={{top: 0, right: 0, left: 0, bottom: 0}}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            showBackdrop: true,
                            popupPlacement: 'top',
                            position: 'fixed',
                            zIndex: 999,
                            maxWidth: '100%',
                            height: '100%',
                            width: '100%',
                            border: {radius: 0}
                        }
                    }
                ]}
            >
                <i-vstack>
                    <i-hstack
                        verticalAlignment="center" horizontalAlignment="space-between"
                        padding={{right: '1rem', left: '1rem', top: '1rem', bottom: '1rem'}}
                    >
                        <i-label caption='SCOM Widgets'
                                 font={{color: Theme.colors.primary.main, size: '1rem', bold: true}}></i-label>
                        <i-icon
                            name="times"
                            cursor='pointer'
                            width={20} height={20} fill={Theme.colors.secondary.main}
                            onClick={() => this.onCloseModal('mdWidgets')}
                        ></i-icon>
                    </i-hstack>
                </i-vstack>
            </i-modal>
        </i-panel>;

        this.pnlPostComposer.append(elm);
    }

    private renderPostComposer() {
        const pnlPostAudiences = this.renderPostAudiences();
        this.pnlPostComposer.append(<i-panel padding={{bottom: '0.75rem', top: '0.75rem'}} cursor='default'>
            <i-hstack
                id="pnlReplyTo"
                visible={false}
                gap="0.5rem"
                verticalAlignment="center"
                padding={{top: '0.25rem', bottom: '0.75rem', left: '3.25rem'}}
            >
                <i-label
                    caption="Replying to"
                    font={{size: '1rem', color: Theme.text.secondary}}
                ></i-label>
                <i-label
                    id="lbReplyTo"
                    link={{href: ''}}
                    font={{size: '1rem', color: Theme.colors.primary.main}}
                ></i-label>
            </i-hstack>
            <i-grid-layout
                id="gridReply"
                gap={{column: '0.75rem'}}
                templateColumns={['2.75rem', 'minmax(auto, calc(100% - 3.5rem))']}
                templateRows={['auto']}
                templateAreas={[
                    ['avatar', 'editor'],
                    ['avatar', 'reply']
                ]}
            >
                <i-image
                    id="imgReplier"
                    grid={{area: 'avatar'}}
                    width={'2.75rem'}
                    height={'2.75rem'}
                    display="block"
                    background={{color: Theme.background.main}}
                    border={{radius: '50%'}}
                    overflow={'hidden'}
                    margin={{top: '0.75rem'}}
                    objectFit='cover'
                    url={this._avatar}
                    fallbackUrl={assets.fullPath('img/default_avatar.png')}
                ></i-image>
                <i-panel
                    grid={{area: 'editor'}}
                    maxHeight={'45rem'}
                    overflow={{x: 'hidden', y: 'auto'}}
                >
                    <i-markdown-editor
                        id="mdEditor"
                        width="100%"
                        viewer={false}
                        hideModeSwitch={true}
                        mode="wysiwyg"
                        toolbarItems={[]}
                        font={{size: '1.25rem', color: Theme.text.primary}}
                        lineHeight={1.5}
                        padding={{top: 12, bottom: 12, left: 0, right: 0}}
                        background={{color: 'transparent'}}
                        height="auto"
                        minHeight={0}
                        overflow={'hidden'}
                        overflowWrap="break-word"
                        onChanged={this.onEditorChanged.bind(this)}
                        cursor='text'
                        border={{style: 'none'}}
                        visible={true}
                    ></i-markdown-editor>
                </i-panel>

                {/* comment */}
                <i-hstack
                    id="pnlBorder"
                    horizontalAlignment="space-between"
                    grid={{area: 'reply'}}
                    padding={{top: '0.625rem'}}
                >
                    <i-hstack
                        id="pnlIcons"
                        gap="4px" verticalAlignment="center"
                        visible={false}
                    >
                        <i-icon
                            id="iconMediaMobile"
                            name="image" width={28} height={28} fill={Theme.colors.primary.main}
                            border={{radius: '50%'}}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'Media', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={this.showStorage}
                        ></i-icon>
                        <i-icon
                            name="images" width={28} height={28} fill={Theme.colors.primary.main}
                            border={{radius: '50%'}}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'GIF', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={this.onShowGifModal}
                        ></i-icon>
                        <i-panel>
                            <i-icon
                                name="smile" width={28} height={28} fill={Theme.colors.primary.main}
                                border={{radius: '50%'}}
                                padding={{top: 5, bottom: 5, left: 5, right: 5}}
                                tooltip={{content: 'Emoji', placement: 'bottom'}}
                                cursor="pointer"
                                onClick={() => this.onShowModal('mdEmoji')}
                            ></i-icon>
                            <i-modal
                                id="mdEmoji"
                                maxWidth={'100%'}
                                minWidth={320}
                                popupPlacement='bottomRight'
                                showBackdrop={false}
                                border={{radius: '1rem'}}
                                boxShadow='rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px'
                                padding={{top: 0, left: 0, right: 0, bottom: 0}}
                                closeOnScrollChildFixed={true}
                                onOpen={this.onEmojiMdOpen.bind(this)}
                                visible={false}
                            >
                                <i-vstack position='relative' padding={{left: '0.25rem', right: '0.25rem'}}>
                                    <i-hstack
                                        verticalAlignment="center"
                                        border={{radius: '9999px', width: '1px', style: 'solid', color: Theme.divider}}
                                        minHeight={40} width={'100%'}
                                        background={{color: Theme.input.background}}
                                        padding={{left: '0.75rem', right: '0.75rem'}}
                                        margin={{top: '0.25rem', bottom: '0.25rem'}}
                                        gap="4px"
                                    >
                                        <i-icon width={'1rem'} height={'1rem'} name='search'
                                                fill={Theme.text.secondary}/>
                                        <i-input
                                            id="inputEmoji"
                                            placeholder='Search Emojis'
                                            width='100%'
                                            height='100%'
                                            border={{style: 'none'}}
                                            captionWidth={'0px'}
                                            showClearButton={true}
                                            onClearClick={this.onEmojiMdOpen.bind(this)}
                                            onKeyUp={this.onEmojiSearch.bind(this)}
                                        ></i-input>
                                    </i-hstack>
                                    <i-grid-layout
                                        id="gridEmojiCate"
                                        verticalAlignment="center"
                                        columnsPerRow={9}
                                        margin={{top: 4}}
                                        grid={{verticalAlignment: 'center', horizontalAlignment: 'center'}}
                                        border={{bottom: {width: '1px', style: 'solid', color: Theme.divider}}}
                                    ></i-grid-layout>
                                    <i-vstack id="groupEmojis" maxHeight={400} overflow={{y: 'auto'}}/>
                                    <i-vstack
                                        id="pnlEmojiResult"
                                        border={{bottom: {width: '1px', style: 'solid', color: Theme.divider}}}
                                        maxHeight={400} overflow={{y: 'auto'}}
                                        minHeight={200}
                                        gap="0.75rem"
                                        visible={false}
                                    />
                                    <i-hstack
                                        bottom="0px" left="0px" position="absolute" width={'100%'}
                                        verticalAlignment="center" horizontalAlignment="space-between"
                                        padding={{top: '0.75rem', left: '0.75rem', right: '0.75rem', bottom: '0.75rem'}}
                                        gap="0.75rem" zIndex={20}
                                        background={{color: Theme.background.modal}}
                                        border={{
                                            radius: '0 0 1rem 1rem',
                                            top: {width: '1px', style: 'solid', color: Theme.divider}
                                        }}
                                    >
                                        <i-label id="lbEmoji" width={'1.25rem'} height={'1.25rem'}
                                                 display="inline-block"></i-label>
                                        <i-hstack
                                            id="pnlColors"
                                            verticalAlignment="center" gap={'0.25rem'}
                                            overflow={'hidden'}
                                            cursor="pointer"
                                            padding={{
                                                top: '0.25rem',
                                                left: '0.25rem',
                                                right: '0.25rem',
                                                bottom: '0.25rem'
                                            }}
                                        />
                                    </i-hstack>
                                </i-vstack>
                            </i-modal>
                        </i-panel>
                        <i-icon
                            width={28}
                            height={28}
                            name="shapes"
                            fill={Theme.colors.primary.main}
                            padding={{top: 5, bottom: 5, left: 5, right: 5}}
                            tooltip={{content: 'Widgets', placement: 'bottom'}}
                            cursor="pointer"
                            onClick={() => this.onShowWidgets()}
                        ></i-icon>
                    </i-hstack>
                    <i-stack direction="horizontal" width="100%" alignItems="center" justifyContent="end" gap="0.5rem">
                        <i-panel>
                            <i-button
                                id="btnPostAudience"
                                height={32}
                                padding={{left: '1rem', right: '1rem'}}
                                background={{color: Theme.colors.secondary.main}}
                                font={{color: Theme.colors.secondary.contrastText, bold: true}}
                                border={{radius: '0.375rem'}}
                                caption={this.audience.title}
                                icon={{ width: 14, height: 14, name: this.audience.icon, fill: Theme.colors.secondary.contrastText }}
                                rightIcon={{ width: 14, height: 14, name: 'angle-down', fill: Theme.colors.secondary.contrastText }}
                                visible={this.isPostAudienceShown}
                                onClick={this.showPostAudienceModal.bind(this)}
                            ></i-button>
                            <i-modal
                                id="mdPostAudience"
                                maxWidth={'15rem'}
                                minWidth={'12.25rem'}
                                maxHeight={'27.5rem'}
                                popupPlacement='bottomRight'
                                showBackdrop={false}
                                border={{ radius: '0.5rem' }}
                                boxShadow="rgba(255, 255, 255, 0.2) 0px 0px 15px, rgba(255, 255, 255, 0.15) 0px 0px 3px 1px"
                                padding={{ top: 0, bottom: 0, left: 0, right: 0 }}
                                overflow={{ y: 'hidden' }}
                                visible={false}
                            >
                                {pnlPostAudiences}
                            </i-modal>
                        </i-panel>
                        <i-button
                            id="btnReply"
                            height={36}
                            padding={{left: '1rem', right: '1rem'}}
                            background={{color: Theme.colors.primary.main}}
                            font={{color: Theme.colors.primary.contrastText, bold: true}}
                            border={{radius: '30px'}}
                            enabled={false}
                            caption="Post"
                            onClick={this.onReply.bind(this)}
                        ></i-button>
                    </i-stack>
                </i-hstack>
            </i-grid-layout>

            <i-modal
                id="mdGif"
                border={{radius: '1rem'}}
                maxWidth={'600px'}
                maxHeight={'90vh'}
                overflow={{y: 'auto'}}
                padding={{top: 0, right: 0, left: 0, bottom: 0}}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            showBackdrop: true,
                            popupPlacement: 'top',
                            position: 'fixed',
                            zIndex: 999,
                            maxWidth: '100%',
                            height: '100%',
                            width: '100%',
                            border: {radius: 0}
                        }
                    }
                ]}
                onOpen={this.onGifMdOpen.bind(this)}
                onClose={this.onGifMdClose.bind(this)}
            >
                <i-vstack>
                    <i-hstack
                        verticalAlignment="center"
                        height={53}
                        margin={{top: 8, bottom: 8}}
                        padding={{right: '0.5rem', left: '0.5rem'}}
                        position="sticky"
                        zIndex={2} top={'0px'}
                        background={{color: Theme.background.modal}}
                    >
                        <i-panel
                            id="pnlGifBack"
                            padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.5rem', right: '0.5rem' }}
                            cursor='pointer'
                            onClick={this.onBack.bind(this)}
                            visible={false}
                        >
                            <i-icon
                                name="arrow-left"
                                width={20} height={20} fill={Theme.colors.secondary.main}
                            ></i-icon>
                        </i-panel>
                        <i-hstack
                            verticalAlignment="center"
                            padding={{left: '0.75rem', right: '0.75rem'}}
                            border={{radius: '9999px', width: '1px', style: 'solid', color: Theme.divider}}
                            minHeight={40} width={'100%'}
                            background={{color: Theme.input.background}}
                            gap="4px"
                        >
                            <i-icon width={16} height={16} name='search' fill={Theme.text.secondary}/>
                            <i-input
                                id="inputGif"
                                placeholder='Search for GIFs'
                                width='100%'
                                height='100%'
                                captionWidth={'0px'}
                                border={{style: 'none'}}
                                showClearButton={true}
                                onClearClick={() => this.onToggleMainGif(true)}
                                onKeyUp={(target: Input) => this.onGifSearch(target.value)}
                            ></i-input>
                        </i-hstack>
                        <i-panel
                            id="pnlGifClose"
                            padding={{ top: '0.5rem', bottom: '0.5rem', left: '0.5rem', right: '0.5rem' }}
                            cursor='pointer'
                            onClick={this.onCloseGifModal.bind(this)}
                        >
                            <i-icon
                                name="times"
                                width={20} height={20} fill={Theme.colors.secondary.main}
                            ></i-icon>
                        </i-panel>
                    </i-hstack>
                    <i-panel id="gifCateLoading" height={600}>
                        <i-stack
                            direction="vertical"
                            height="100%" width="100%"
                            class="i-loading-overlay"
                            background={{color: Theme.background.modal}}
                        >
                            <i-stack direction="vertical" class="i-loading-spinner" alignItems="center" justifyContent="center">
                                <i-icon
                                    class="i-loading-spinner_icon"
                                    name="spinner"
                                    width={24}
                                    height={24}
                                    fill={Theme.colors.primary.main}
                                />
                            </i-stack>
                        </i-stack>
                    </i-panel>
                    <i-card-layout
                        id="gridGifCate"
                        cardMinWidth={'18rem'}
                        cardHeight={'9.375rem'}
                        visible={false}
                    ></i-card-layout>
                    <i-vstack id="pnlGif" visible={false}>
                        <i-hstack
                            horizontalAlignment="space-between"
                            gap="0.5rem"
                            padding={{left: '0.75rem', right: '0.75rem', top: '0.75rem', bottom: '0.75rem'}}
                        >
                            <i-label caption="Auto-play GIFs"
                                     font={{color: Theme.text.secondary, size: '0.9rem'}}></i-label>
                            <i-switch
                                id="autoPlaySwitch"
                                checked={true}
                                uncheckedTrackColor={Theme.divider}
                                checkedTrackColor={Theme.colors.primary.main}
                                onChanged={this.onGifPlayChanged.bind(this)}
                            ></i-switch>
                        </i-hstack>
                        <i-panel id="topElm" width={'100%'}></i-panel>
                        <i-card-layout
                            id="gridGif"
                            autoRowSize="auto"
                            autoColumnSize="auto"
                            cardHeight={'auto'}
                            columnsPerRow={4}
                        ></i-card-layout>
                        <i-panel id="bottomElm" width={'100%'} minHeight={20}>
                            <i-vstack
                                id="gifLoading"
                                padding={{top: '0.5rem', bottom: '0.5rem'}}
                                visible={false}
                                height="100%" width="100%"
                                class="i-loading-overlay"
                                background={{color: Theme.background.modal}}
                            >
                                <i-vstack class="i-loading-spinner" horizontalAlignment="center"
                                          verticalAlignment="center">
                                    <i-icon
                                        class="i-loading-spinner_icon"
                                        name="spinner"
                                        width={24}
                                        height={24}
                                        fill={Theme.colors.primary.main}
                                    />
                                </i-vstack>
                            </i-vstack>
                        </i-panel>
                    </i-vstack>
                </i-vstack>
            </i-modal>

            <i-modal
                id="mdWidgets"
                border={{radius: '1rem'}}
                maxWidth={'600px'}
                maxHeight={'90vh'}
                overflow={{y: 'auto'}}
                padding={{top: 0, right: 0, left: 0, bottom: 0}}
                mediaQueries={[
                    {
                        maxWidth: '767px',
                        properties: {
                            showBackdrop: true,
                            popupPlacement: 'top',
                            position: 'fixed',
                            zIndex: 999,
                            maxWidth: '100%',
                            height: '100%',
                            width: '100%',
                            border: {radius: 0}
                        }
                    }
                ]}
            >
                <i-vstack>
                    <i-hstack
                        verticalAlignment="center" horizontalAlignment="space-between"
                        padding={{right: '1rem', left: '1rem', top: '1rem', bottom: '1rem'}}
                    >
                        <i-label caption='SCOM Widgets'
                                 font={{color: Theme.colors.primary.main, size: '1rem', bold: true}}></i-label>
                        <i-icon
                            name="times"
                            cursor='pointer'
                            width={20} height={20} fill={Theme.colors.secondary.main}
                            onClick={() => this.onCloseModal('mdWidgets')}
                        ></i-icon>
                    </i-hstack>
                </i-vstack>
            </i-modal>
        </i-panel>)
    }

    render() {
        return (
            <i-panel id={'pnlPostComposer'}>
                <i-alert
                    id="mdAlert"
                    status="confirm"
                    title="Are you sure?"
                    content="Do you really want to delete this widget?"
                />
            </i-panel>
        );
    }
}
