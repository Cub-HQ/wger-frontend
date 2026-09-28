import type { Muscle } from "@/components/Exercises";
import { PUBLIC_URL } from "@/config";
import React from "react";

type OverviewCardProps = {
    primaryMuscles: Muscle[];
    secondaryMuscles: Muscle[];
    isFront: boolean;
};

export const MuscleOverview = ({ primaryMuscles, secondaryMuscles, isFront }: OverviewCardProps) => {
    const backgroundStyle = [];

    backgroundStyle.push(
        ...primaryMuscles
            .filter(m => m.isFront === isFront)
            .map(m => `/muscles/main/muscle-${m.id}.svg`)
    );
    backgroundStyle.push(
        ...secondaryMuscles
            .filter(m => m.isFront === isFront)
            .map(m => `/muscles/secondary/muscle-${m.id}.svg`)
    );
    backgroundStyle.push(isFront ? "/muscles/muscular_system_front.svg" : "/muscles/muscular_system_back.svg");
    const backgroundUrl = backgroundStyle.map(url => `url(${PUBLIC_URL}${url})`).join(", ");

    return (
        <div
            style={{
                height: "auto",
                width: "200px",
                maxWidth: "100%",
                aspectRatio: "1 / 2",
                backgroundSize: "contain",
                backgroundImage: backgroundUrl,
                backgroundRepeat: "no-repeat"
            }} />
    );
};
