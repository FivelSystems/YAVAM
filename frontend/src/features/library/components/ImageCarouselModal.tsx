import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getBlurStyle } from '../utils';

export interface CarouselImage {
    src: string;
    alt: string;
}

interface ImageCarouselModalProps {
    images: CarouselImage[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
    censorThumbnails?: boolean;
    blurAmount?: number;
}

export const ImageCarouselModal = ({ 
    images, 
    initialIndex = 0, 
    isOpen, 
    onClose,
    censorThumbnails = false,
    blurAmount = 10
}: ImageCarouselModalProps) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset index and focus when opened
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
            // Focus the container to catch keyboard events
            setTimeout(() => containerRef.current?.focus(), 10);
        }
    }, [isOpen, initialIndex, images.length]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
        } else if (e.key === 'ArrowLeft') {
            e.stopPropagation();
            handlePrev();
        } else if (e.key === 'ArrowRight') {
            e.stopPropagation();
            handleNext();
        }
    };

    const handlePrev = useCallback(() => {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const handleNext = useCallback(() => {
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    if (!isOpen || images.length === 0) return null;

    // Safety clamp to prevent crashes if images array changes
    const safeIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
    const currentImage = images[safeIndex];

    return (
        <AnimatePresence>
            <motion.div
                ref={containerRef}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md outline-none"
                onClick={onClose}
            >
                {/* Close Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="absolute top-4 right-4 z-[101] p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                    <X size={24} />
                </button>

                {/* Main Image Container */}
                <div 
                    className="relative w-full h-full max-w-7xl max-h-screen flex items-center justify-center p-4 sm:p-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Navigation Buttons */}
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                className="absolute left-4 p-4 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors group z-[101]"
                            >
                                <ChevronLeft size={32} className="group-hover:-translate-x-1 transition-transform" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                className="absolute right-4 p-4 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors group z-[101]"
                            >
                                <ChevronRight size={32} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </>
                    )}

                    {/* The Image */}
                    <motion.div
                        key={safeIndex}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="relative max-w-full max-h-full flex flex-col items-center justify-center"
                    >
                        <img
                            src={currentImage.src}
                            alt={currentImage.alt}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            style={getBlurStyle(censorThumbnails, blurAmount)}
                        />
                        <div className="absolute bottom-[-40px] text-gray-400 font-mono text-sm bg-black/50 px-4 py-1 rounded-full whitespace-nowrap">
                            {safeIndex + 1} / {images.length} — {currentImage.alt}
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
