import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Slider } from '../ui/Slider';
import { PAGINATION_STRINGS } from '../../config/uiStrings';
import { FIRST_PAGE } from '../../utils/pagination';

interface PageJumpFormProps {
    currentPage: number;
    totalPages: number;
    /** Receives the page exactly as typed or scrubbed; the caller bounds it with `clampPage`. */
    onJump: (page: number) => void;
    withSlider?: boolean;
}

const parsePage = (draft: string): number | null => {
    const page = Number.parseInt(draft, 10);
    return Number.isFinite(page) ? page : null;
};

/** Page-number entry shared by the desktop popover and the mobile sheet. Enter or Go confirms; Escape is left to the host overlay. */
export const PageJumpForm = ({ currentPage, totalPages, onJump, withSlider = false }: PageJumpFormProps) => {
    const [draft, setDraft] = useState(String(currentPage));
    const parsedDraft = parsePage(draft);
    const sliderValue = Math.min(Math.max(FIRST_PAGE, parsedDraft ?? currentPage), totalPages);

    const confirm = () => {
        if (parsedDraft !== null) onJump(parsedDraft);
    };

    return (
        <form
            noValidate
            className="flex flex-col gap-4 p-3"
            onSubmit={(event) => { event.preventDefault(); confirm(); }}
        >
            <div className="flex items-end gap-2">
                <Input
                    type="number"
                    inputMode="numeric"
                    enterKeyHint="go"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    aria-label={PAGINATION_STRINGS.pageInputLabel}
                    rightLabel={`/ ${totalPages}`}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="submit" variant="primary" className="h-11 md:h-9">
                    {PAGINATION_STRINGS.confirmJump}
                </Button>
            </div>
            {withSlider && (
                <Slider
                    min={FIRST_PAGE}
                    max={totalPages}
                    value={sliderValue}
                    onChange={(page) => setDraft(String(page))}
                    ariaLabel={PAGINATION_STRINGS.pageSliderLabel}
                />
            )}
        </form>
    );
};
